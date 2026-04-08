import uuid
import os
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.problem import SourceExam, Question
from app.schemas.problem import SourceExamOut
from app.services.auth_service import get_current_user
from app.services.ocr_service import extract_questions
from app.services.embed_service import add_question

router = APIRouter(tags=["Upload"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_SIZE_MB = 10

# Thư mục lưu ảnh, tương đối với thư mục gốc của repo backend
STATIC_DIR = Path(__file__).parent.parent.parent / "static" / "exams"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/exam-image", response_model=SourceExamOut)
async def upload_exam_image(
    file: UploadFile = File(...),
    title: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh JPG, PNG, WEBP")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File quá lớn, tối đa {MAX_SIZE_MB}MB")

    # OCR: trích xuất câu hỏi từ ảnh
    try:
        parsed = await extract_questions(image_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Không thể đọc đề từ ảnh: {str(e)}")

    if not parsed:
        raise HTTPException(status_code=422, detail="Không tìm thấy câu hỏi nào trong ảnh")

    # Lưu ảnh gốc vào đĩa (dùng UUID tránh trùng tên)
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = STATIC_DIR / filename
    save_path.write_bytes(image_bytes)
    image_url = f"/static/exams/{filename}"

    # Lưu đề gốc
    exam = SourceExam(user_id=user.id, title=title or file.filename, image_url=image_url)
    db.add(exam)
    db.flush()

    # Lưu từng câu hỏi vào MySQL + Chroma
    for q_data in parsed:
        q = Question(
            source_exam_id=exam.id,
            user_id=user.id,
            content=q_data.get("content", ""),
            topic=q_data.get("topic", "Khác"),
            difficulty=q_data.get("difficulty", "medium"),
            has_image=bool(q_data.get("has_image", False)),
        )
        db.add(q)
        db.flush()
        q.chroma_id = f"q_{q.id}"
        await add_question(q)

    db.commit()
    db.refresh(exam)
    return exam
