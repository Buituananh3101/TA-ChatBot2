import os
import uuid
import asyncio
import pathlib
import base64
import mimetypes
import logging
from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

# Thư mục gốc backend
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(BASE_DIR, "app", "templates")
TEMP_DIR = os.path.join(BASE_DIR, "temp")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Đảm bảo temp dir tồn tại
os.makedirs(TEMP_DIR, exist_ok=True)

# Khởi tạo Jinja2
env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))


def _image_to_data_uri(relative_url: str) -> str | None:
    """
    Chuyển đường dẫn ảnh tương đối (VD: /static/exams/abc.jpg)
    thành base64 data URI để embed trực tiếp vào HTML.
    Trả về None nếu file không tồn tại.
    """
    # relative_url: "/static/exams/abc.jpg" → strip "/static/" → "exams/abc.jpg"
    if not relative_url:
        return None

    # Xử lý path: bỏ prefix /static/ để lấy path tương đối trong STATIC_DIR
    clean = relative_url.lstrip("/")
    if clean.startswith("static/"):
        clean = clean[len("static/"):]

    file_path = os.path.join(STATIC_DIR, clean)
    if not os.path.exists(file_path):
        logger.warning(f"Image file not found: {file_path}")
        return None

    mime, _ = mimetypes.guess_type(file_path)
    if not mime:
        mime = "image/jpeg"

    try:
        with open(file_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception as e:
        logger.warning(f"Failed to read image {file_path}: {e}")
        return None


def _generate_pdf_sync(html_path: str, pdf_path: str) -> None:
    """
    Chạy Playwright sync API trong thread riêng.
    Trên Windows, asyncio event loop của uvicorn không hỗ trợ subprocess,
    nên phải dùng sync_api + asyncio.to_thread() để tránh NotImplementedError.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mở file HTML cục bộ
        file_uri = pathlib.Path(html_path).absolute().as_uri()
        page.goto(file_uri)

        # Đợi load xong script KaTeX (phát hiện #math-rendered)
        try:
            page.wait_for_selector("#math-rendered", state="attached", timeout=5000)
        except Exception as e:
            logger.warning(f"Timeout waiting for math-rendered or KaTeX fail: {e}")

        # Đợi cho tất cả hình ảnh nếu có load xong
        page.wait_for_load_state("networkidle", timeout=5000)

        # Xuất PDF
        page.pdf(
            path=pdf_path,
            format="A4",
            margin={"top": "20px", "right": "20px", "bottom": "20px", "left": "20px"},
            print_background=True,
        )

        browser.close()


async def generate_questions_pdf(questions: list, user_name: str, base_url: str) -> str:
    """
    Nhận mảng Questions, render ra HTML nội bộ và gọi Playwright sinh file PDF.
    Ảnh được embed trực tiếp dưới dạng base64 data URI → không phụ thuộc server URL.
    Trả về đường dẫn tuyệt đối của file PDF (ví dụ: .../temp/5f1c...pdf).
    """
    try:
        # Chuẩn bị dữ liệu câu hỏi kèm ảnh base64
        questions_data = []
        for q in questions:
            image_data_uri = None
            if q.has_image and q.source_image_url:
                image_data_uri = _image_to_data_uri(q.source_image_url)

            questions_data.append({
                "content": q.content,
                "topic": q.topic,
                "review_count": q.review_count,
                "has_image": q.has_image,
                "image_data_uri": image_data_uri,
            })

        # Load Template và bind biến
        template = env.get_template("messenger_pdf.html")
        html_content = template.render(
            questions=questions_data,
            user_name=user_name,
        )

        # Ghi tạm HTML ra file
        temp_id = str(uuid.uuid4())
        html_path = os.path.join(TEMP_DIR, f"{temp_id}.html")
        pdf_path = os.path.join(TEMP_DIR, f"{temp_id}.pdf")

        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Chạy Playwright sync trong thread riêng (tránh NotImplementedError trên Windows)
        await asyncio.to_thread(_generate_pdf_sync, html_path, pdf_path)

        # Xóa file HTML rác
        if os.path.exists(html_path):
            os.remove(html_path)

        return pdf_path

    except Exception as e:
        import traceback
        logger.error(f"Generate PDF Fail: {e}\n{traceback.format_exc()}")
        return ""

