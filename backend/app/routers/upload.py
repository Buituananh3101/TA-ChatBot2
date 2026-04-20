import uuid
import os
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.problem import SourceExam, Question
from app.schemas.problem import SourceExamOut
from app.services.auth_service import get_current_user
from app.services.ocr_service import (
    extract_questions, 
    OCRServiceUnavailable, 
    OCRQuotaExceeded
)
from app.services.embed_service import add_question

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Upload"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_SIZE_MB = 10

# Thư mục lưu ảnh
STATIC_DIR = Path(__file__).parent.parent.parent / "static" / "exams"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/exam-image", response_model=SourceExamOut)
async def upload_exam_image(
    file: UploadFile = File(...),
    title: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400, 
            detail="Chỉ chấp nhận file ảnh JPG, PNG, WEBP, HEIC"
        )

    # Read and validate file size
    image_bytes = await file.read()
    if len(image_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400, 
            detail=f"File quá lớn, tối đa {MAX_SIZE_MB}MB"
        )

    # OCR: trích xuất câu hỏi từ ảnh với retry logic
    try:
        logger.info(f"Starting OCR for user {user.id}, file: {file.filename}")
        parsed = await extract_questions(image_bytes)
        
    except OCRServiceUnavailable as e:
        # Lỗi 503 - Service quá tải
        logger.warning(f"OCR service unavailable for user {user.id}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Hệ thống OCR đang quá tải. Vui lòng thử lại sau 1-2 phút. 🔄"
        )
        
    except OCRQuotaExceeded as e:
        # Lỗi 429 - Vượt quota
        logger.error(f"OCR quota exceeded for user {user.id}: {e}")
        raise HTTPException(
            status_code=429,
            detail="Đã vượt giới hạn xử lý ảnh hôm nay. Vui lòng thử lại sau. ⏰"
        )
        
    except ValueError as e:
        # Lỗi parse JSON
        logger.error(f"OCR parse error for user {user.id}: {e}")
        raise HTTPException(
            status_code=422,
            detail=f"Không thể đọc được nội dung từ ảnh. Vui lòng thử ảnh rõ hơn. 📷"
        )
        
    except Exception as e:
        # Lỗi khác
        logger.error(f"OCR unexpected error for user {user.id}: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi hệ thống khi xử lý ảnh. Vui lòng thử lại. ⚠️"
        )

    # Kiểm tra kết quả
    if not parsed:
        logger.warning(f"No questions found in image for user {user.id}")
        raise HTTPException(
            status_code=422, 
            detail="Không tìm thấy câu hỏi nào trong ảnh. Vui lòng kiểm tra lại ảnh. 🔍"
        )

    # Tạo đề gốc để lấy ID trước
    exam = SourceExam(
        user_id=user.id, 
        title=title or file.filename, 
        image_url=""
    )
    db.add(exam)
    db.flush()

    # Lưu ảnh gốc vào thư mục riêng của exam
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    
    exam_dir = STATIC_DIR / f"user_{user.id}" / f"exam_{exam.id}"
    exam_dir.mkdir(parents=True, exist_ok=True)
    
    save_path = exam_dir / filename
    save_path.write_bytes(image_bytes)
    
    image_url = f"/static/exams/user_{user.id}/exam_{exam.id}/{filename}"
    exam.image_url = image_url
    db.flush()
    
    logger.info(f"Saved image to {save_path}")

    # Lưu từng câu hỏi vào MySQL + Chroma
    for i, q_data in enumerate(parsed, 1):
        try:
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
            logger.info(f"Added question {i}/{len(parsed)} (ID: {q.id})")
            
        except Exception as e:
            logger.error(f"Error adding question {i}: {e}")
            # Continue with other questions even if one fails
            continue

    db.commit()
    db.refresh(exam)
    
    logger.info(f"Successfully created exam {exam.id} with {len(parsed)} questions")
    return exam