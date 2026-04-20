# from openai import AsyncOpenAI
# from app.config import settings

# client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# SYSTEM_PROMPT = """Bạn là gia sư toán cho học sinh cấp 3 Việt Nam.
# Khi giải bài, hãy:
# 1. Phân tích đề bài rõ ràng
# 2. Trình bày từng bước giải chi tiết
# 3. Giải thích lý do từng bước
# 4. Kết luận đáp án cuối cùng
# Dùng tiếng Việt, ngôn ngữ dễ hiểu, phù hợp học sinh cấp 3."""

# async def chat(history: list, user_message: str) -> str:
#     messages = [{"role": "system", "content": SYSTEM_PROMPT}]
#     messages += history
#     messages.append({"role": "user", "content": user_message})

#     response = await client.chat.completions.create(
#         model="gpt-4o",
#         messages=messages,
#         max_tokens=2000,
#         temperature=0.3,
#     )
#     return response.choices[0].message.content

#123ThayAPI
from google import genai
from google.genai import types
from app.config import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = """Bạn là gia sư toán cho học sinh cấp 3 Việt Nam.
Khi giải bài, hãy:
1. Phân tích đề bài rõ ràng
2. Trình bày từng bước giải chi tiết
3. Giải thích lý do từng bước
4. Kết luận đáp án cuối cùng

QUAN TRỌNG VỀ ĐỊNH DẠNG:
- Dùng tiếng Việt, ngôn ngữ dễ hiểu, phù hợp học sinh cấp 3.
- Công thức toán học INLINE PHẢI bọc trong cặp dấu `$` (ví dụ: $x^2 = 4$).
- Công thức toán học BLOCK (đứng riêng một dòng) PHẢI bọc trong cặp dấu `$$`
- Không sử dụng `\(` hay `\[`."""

async def chat(history: list, user_message: str) -> str:
    # Convert OpenAI history format to Gemini format
    contents = []
    for msg in history:
        role = msg.get("role")
        content = msg.get("content")
        if role == "system":
            continue # Tránh add system prompt như message bình thường
        gemini_role = "model" if role == "assistant" else "user"
        contents.append(types.Content(role=gemini_role, parts=[types.Part.from_text(text=content)]))
        
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))

    response = await client.aio.models.generate_content(
        model='gemini-2.5-flash',
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.3,
            max_output_tokens=2000,
        )
    )
    return response.text

GROUNDED_SYSTEM_PROMPT = """Bạn là trợ lý học tập AI.
Vui lòng trả lời câu hỏi của người dùng DỰA VÀO CÁC TÀI LIỆU được cung cấp bên dưới.
Nếu tài liệu không chứa thông tin để trả lời, HÃY TRẢ LỜI RÕ: "Tài liệu không đề cập đến thông tin này."
Không được bịa đặt thông tin.

QUY TẮC TRÍCH DẪN (QUAN TRỌNG):
- Khi sử dụng thông tin từ một nguồn nào đó, hãy gắn thẻ trích dẫn [id] ngay lúc đó. Ví dụ: "Theo tài liệu, phương trình bậc 2 có dạng... [1]"
- Không liệt kê danh sách tài liệu ở cuối. Chỉ dùng trích dẫn inline [id].

QUAN TRỌNG VỀ ĐỊNH DẠNG:
- Dùng tiếng Việt, ngôn ngữ dễ hiểu.
- Công thức toán học INLINE PHẢI bọc trong cặp dấu `$` (ví dụ: $x^2 = 4$).
- Công thức toán học BLOCK (đứng riêng một dòng) PHẢI bọc trong cặp dấu `$$`
- Không sử dụng `\(` hay `\[`."""

async def grounded_chat(history: list, user_message: str, context_chunks: list[dict]) -> str:
    """Chat với context (đoạn tài liệu) từ ChromaDB"""
    
    # Tạo nội dung chứa các chunks
    context_text = "CÁC TÀI LIỆU THAM KHẢO:\n"
    for idx, chunk in enumerate(context_chunks):
        source_id = chunk.get("source_id", "unknown")
        text = chunk.get("text", "")
        # Đánh số ID dựa trên source_id (để tooltip ở frontend map đúng nguồn)
        context_text += f"\n--- TÀI LIỆU [Nguồn {source_id}] ---\n{text}\n"

    # Gộp context vào câu hỏi của user
    augmented_user_message = f"{context_text}\n\n--- CÂU HỎI CỦA NGƯỜI DÙNG ---\n{user_message}"
    
    contents = []
    for msg in history:
        role = msg.get("role")
        content = msg.get("content")
        if role == "system":
            continue
        gemini_role = "model" if role == "assistant" else "user"
        contents.append(types.Content(role=gemini_role, parts=[types.Part.from_text(text=content)]))
        
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=augmented_user_message)]))

    response = await client.aio.models.generate_content(
        model='gemini-2.5-flash',
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=GROUNDED_SYSTEM_PROMPT,
            temperature=0.2, # Nhiệt độ thấp hơn để bám sát tài liệu
            max_output_tokens=2000,
        )
    )
    return response.text
