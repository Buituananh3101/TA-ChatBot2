import json
import re
import logging
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)
client = genai.Client(api_key=settings.GEMINI_API_KEY)

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
    # Tìm các cụm A., B., C., D. (có dấu cách đằng sau) và ép thêm \n\n phía trước.
    # Dùng \n\n để Markdown ép buộc tạo thẻ <p> mới, giúp tách dòng chắc chắn 100%.
    text = re.sub(r'\s+(A[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(B[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(C[.)]\s+)', r'\n\n\1', text)
    text = re.sub(r'\s+(D[.)]\s+)', r'\n\n\1', text)

    # Nếu A. nằm ở ngay sát đầu văn bản (hiếm khi xảy ra nhưng phòng hờ)
    text = re.sub(r'^([A-D][.)]\s+)', r'\1', text)

    # 4. Dọn dẹp khoảng trắng thừa (>2 dòng trắng liên tiếp thì gom lại)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()

# ─── Main function ────────────────────────────────────────────────────────────

async def extract_questions(image_bytes: bytes) -> list[dict]:
    try:
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash',
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
                # Ép AI trả về đúng cấu trúc Pydantic đã định nghĩa
                response_schema=list[Question], 
            )
        )

        # Do dùng response_schema, raw text trả về chắc chắn là JSON mảng hợp lệ
        raw = response.text
        questions = json.loads(raw)

        # Chuẩn hóa từng câu hỏi để đảm bảo format LaTeX/Markdown đẹp nhất
        for q in questions:
            if isinstance(q.get('content'), str):
                q['content'] = normalize_content(q['content'])

        return questions

    except json.JSONDecodeError as e:
        logger.error(f"OCR JSON parse error: {e}\nRaw: {response.text[:500]}")
        raise ValueError(f"AI trả về định dạng không hợp lệ: {e}")
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise