import json
import re
import logging
import asyncio
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# ─── Custom Exceptions ────────────────────────────────────────────────────────

class OCRServiceUnavailable(Exception):
    """Exception khi Gemini API quá tải (503)"""
    pass

class OCRQuotaExceeded(Exception):
    """Exception khi vượt quota API"""
    pass

# ─── Schema Pydantic (Structured Output) ─────────────────────────────────────

class Question(BaseModel):
    content: str = Field(
        description="Nội dung câu hỏi và các đáp án. BẮT BUỘC dùng $...$ cho công thức inline và $$...$$ cho block. Phải có dấu xuống dòng giữa đề bài và từng đáp án A, B, C, D."
    )
    topic: str = Field(
        description="Chỉ được chọn 1: Đại số, Hình học, Giải tích, Xác suất, Lượng giác, Tổ hợp"
    )
    difficulty: str = Field(
        description="Chỉ được chọn 1: easy, medium, hard"
    )
    has_image: bool = Field(
        description="""
Trả về TRUE nếu trong ảnh câu hỏi này có BẤT KỲ yếu tố nào sau đây:
- Hình vẽ hình học (tam giác, hình trụ, khối hộp...)
- Đồ thị hàm số, đồ thị thống kê
- Bảng biến thiên
- Bảng xét dấu
- Bất kỳ bảng biểu nào khác
- Sơ đồ, biểu đồ
Trả về FALSE nếu câu hỏi chỉ có chữ và công thức toán."""
    )

# ─── Prompt ──────────────────────────────────────────────────────────────────

OCR_PROMPT = """\
Bạn là AI chuyên trích xuất câu hỏi từ ảnh đề toán cấp 3 Việt Nam.
NHIỆM VỤ: Đọc ảnh và trích xuất nội dung chính xác.

QUY TẮC TOÁN HỌC & FORMAT CHO TRƯỜNG "content":
1. CÔNG THỨC TOÁN: Bắt buộc dùng $...$ cho công thức trên cùng dòng (inline) và $$...$$ cho công thức đứng riêng (block). TUYỆT ĐỐI KHÔNG dùng \\( \\) hay \\[ \\].
2. PHÂN SỐ: BẮT BUỘC dùng cú pháp `\\frac{tử}{mẫu}` cho TẤT CẢ các phân số. TUYỆT ĐỐI KHÔNG dùng dấu gạch chéo `/` để chia phân số.
   - SAI: $e^{(x+1)}/(x+1)$ hoặc $a/b$
   - ĐÚNG: $\\frac{e^{(x+1)}}{x+1}$ hoặc $\\frac{a}{b}$
3. TRÌNH BÀY ĐÁP ÁN: Đề bài và các đáp án phải được phân tách bằng dấu xuống dòng. Mỗi đáp án (A, B, C, D) phải nằm trên một dòng riêng biệt.
4. Giữ nguyên 100% nội dung chữ, không tự ý giải hay tóm tắt.
5. BẢNG BIỂU & HÌNH VẼ (QUY TẮC QUAN TRỌNG NHẤT):
   Nếu trong câu hỏi có bất kỳ yếu tố nào sau đây: bảng biến thiên, bảng xét dấu, bảng thống kê, hình vẽ, đồ thị:
   - Đặt has_image = true
   - Chỉ trích xuất PHẦN CHỮ (nội dung đề bài và các đáp án A/B/C/D)
   - TUYỆT ĐỐI KHÔNG cách vẽ lại bảng hay hình vẽ trong trường content
   - Nếu đề bài nhắc đến bảng/hình bằng lời (ví dụ: "Cho bảng biến thiên..."), giữ nguyên câu đó trong content
"""

# ─── Post-processing ──────────────────────────────────────────────────────────

def normalize_content(text: str) -> str:
    """
    Chuẩn hóa nội dung câu hỏi sau khi AI trả về làm "bảo hiểm" lần cuối.
    """
    if not text:
        return text

    # 1. Chuẩn hoá delimiter block math: \[ ... \] → $$ ... $$
    text = re.sub(r'\\\[([\s\S]*?)\\\]', lambda m: f'$$\n{m.group(1).strip()}\n$$', text)

    # 2. Chuẩn hoá delimiter inline math: \( ... \) → $ ... $
    text = re.sub(r'\\\(([\s\S]*?)\\\)', lambda m: f'${m.group(1)}$', text)

    # 3. ÉP XUỐNG DÒNG ĐÁP ÁN (Bạo lực)
    text = re.sub(r'\s+(A[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(B[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(C[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(D[.)]\s+)', r'\n\n\1', text)

    # Nếu A. nằm ở ngay sát đầu văn bản
    text = re.sub(r'^([A-D][.)]\s+)', r'\1', text)

    # 4. Dọn dẹp khoảng trắng thừa
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()

# ─── Retry Logic Helper ───────────────────────────────────────────────────────

async def call_gemini_with_retry(image_bytes: bytes, max_retries: int = 3) -> str:
    """
    Gọi Gemini API với retry logic.
    - 429 quota hết hẳn (limit: 0 / per-day) → KHÔNG retry, báo lỗi ngay
    - 429 rate limit tạm thời (per-minute)    → retry với wait ngắn
    - 503 service unavailable                 → retry với exponential backoff
    """
    last_error = None

    for attempt in range(max_retries):
        try:
            logger.info(f"OCR attempt {attempt + 1}/{max_retries}")

            response = await client.aio.models.generate_content(
                model='gemini-2.5-flash',  # FIX: dùng gemini-2.5-flash thay vì 2.0-flash-exp
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                            types.Part.from_text(text=OCR_PROMPT)
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    max_output_tokens=4000,
                    response_mime_type="application/json",
                    temperature=0.1,
                    response_schema=list[Question],
                )
            )

            if not response.text:
                raise ValueError("Model trả về kết quả rỗng (có thể do lỗi nội dung hoặc kiểm duyệt)")

            logger.info(f"OCR success on attempt {attempt + 1}")
            return response.text

        except Exception as e:
            error_str = str(e)
            last_error = e

            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                # Phân biệt quota hết hẳn (per-day) vs rate limit tạm thời (per-minute)
                is_daily_quota_exhausted = (
                    "PerDay" in error_str
                    or "free_tier_requests" in error_str
                    or "limit: 0" in error_str
                )

                if is_daily_quota_exhausted:
                    # Quota ngày hết → retry vô ích, báo lỗi ngay
                    logger.error(f"OCR daily quota exhausted, not retrying: {error_str[:200]}")
                    raise OCRQuotaExceeded(
                        "Đã hết hạn mức API miễn phí hôm nay. Vui lòng thử lại vào ngày mai hoặc nâng cấp API key."
                    )
                else:
                    # Rate limit tạm thời (per-minute) → chờ ngắn rồi retry
                    wait_time = 15 * (attempt + 1)  # 15s, 30s, 45s
                    logger.warning(
                        f"OCR rate limit (attempt {attempt + 1}/{max_retries}). "
                        f"Retrying in {wait_time}s..."
                    )
                    if attempt < max_retries - 1:
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        raise OCRQuotaExceeded("Vượt giới hạn request/phút. Vui lòng thử lại sau vài phút.")

            elif "503" in error_str or "UNAVAILABLE" in error_str or "high demand" in error_str.lower():
                wait_time = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(
                    f"OCR service unavailable (attempt {attempt + 1}/{max_retries}). "
                    f"Retrying in {wait_time}s..."
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise OCRServiceUnavailable(
                        f"Gemini API quá tải sau {max_retries} lần thử. Vui lòng thử lại sau."
                    )

            else:
                logger.error(f"OCR error (non-retryable): {type(e).__name__}: {error_str[:200]}")
                raise

    raise last_error

# ─── Main function ────────────────────────────────────────────────────────────

async def extract_questions(image_bytes: bytes) -> list[dict]:
    """
    Trích xuất câu hỏi từ ảnh sử dụng Gemini API với retry logic
    
    Args:
        image_bytes: Ảnh dưới dạng bytes
    
    Returns:
        List các câu hỏi dạng dict
    
    Raises:
        OCRServiceUnavailable: Khi Gemini quá tải
        OCRQuotaExceeded: Khi vượt quota
        ValueError: Khi parse JSON thất bại
        Exception: Các lỗi khác
    """
    try:
        # Gọi Gemini với retry logic
        raw = await call_gemini_with_retry(image_bytes, max_retries=3)
        
        # Parse JSON
        questions = json.loads(raw)
        
        if not questions:
            logger.warning("OCR returned empty questions list")
            return []

        # Chuẩn hóa từng câu hỏi
        for q in questions:
            if isinstance(q.get('content'), str):
                q['content'] = normalize_content(q['content'])

        logger.info(f"Successfully extracted {len(questions)} questions")
        return questions

    except json.JSONDecodeError as e:
        logger.error(f"OCR JSON parse error: {e}\nRaw: {raw[:500] if 'raw' in locals() else 'N/A'}")
        raise ValueError(f"AI trả về định dạng không hợp lệ: {e}")
    
    except (OCRServiceUnavailable, OCRQuotaExceeded):
        # Re-raise custom exceptions
        raise
    
    except Exception as e:
        logger.error(f"OCR unexpected error: {type(e).__name__}: {e}")
        raise