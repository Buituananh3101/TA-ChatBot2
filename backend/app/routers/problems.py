from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.schemas.problem import SourceExamOut, SourceExamUpdate, QuestionUpdate, QuestionOut, AnswerBlocksUpdate
from app.models.problem import SourceExam, Question
from app.services.embed_service import update_question_metadata

router = APIRouter(tags=["Problems"])

@router.get("/exams", response_model=list[SourceExamOut])
def list_exams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # FIX: dùng created_at thay vì uploaded_at (không tồn tại trên model)
    return (db.query(SourceExam)
              .filter(SourceExam.user_id == user.id)
              .order_by(SourceExam.created_at.desc())
              .all())

@router.get("/exams/{exam_id}", response_model=SourceExamOut)
def get_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    exam = db.query(SourceExam).filter(SourceExam.id == exam_id, SourceExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")
    return exam

@router.delete("/exams/{exam_id}", status_code=200)
def delete_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    from app.services.embed_service import delete_question
    from app.models.exam import review_exam_questions

    exam = db.query(SourceExam).filter(
        SourceExam.id == exam_id,
        SourceExam.user_id == user.id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")

    question_ids = [q.id for q in exam.questions]
    
    if question_ids:
        db.execute(review_exam_questions.delete().where(review_exam_questions.c.question_id.in_(question_ids)))

    import shutil
    from pathlib import Path
    
    for qid in question_ids:
        try:
            delete_question(qid)
        except Exception:
            pass
            
        # Xóa folder rác chứa ảnh block lời giải của câu hỏi
        try:
            q_dir = Path(__file__).parent.parent.parent / "static" / "answers" / f"user_{user.id}" / f"question_{qid}"
            if q_dir.exists():
                shutil.rmtree(q_dir, ignore_errors=True)
        except Exception:
            pass

    # Xóa folder rác chứa ảnh đề thi gốc
    try:
        e_dir = Path(__file__).parent.parent.parent / "static" / "exams" / f"user_{user.id}" / f"exam_{exam.id}"
        if e_dir.exists():
            shutil.rmtree(e_dir, ignore_errors=True)
    except Exception:
        pass

    db.delete(exam)
    db.commit()
    return {"message": "Đã xoá thành công"}

@router.put("/exams/{exam_id}", response_model=SourceExamOut)
def update_exam(exam_id: int, data: SourceExamUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    exam = db.query(SourceExam).filter(SourceExam.id == exam_id, SourceExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")
    
    exam.title = data.title
    db.commit()
    db.refresh(exam)
    return exam

@router.put("/questions/{question_id}", response_model=QuestionOut)
def update_question(question_id: int, data: QuestionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    question = db.query(Question).filter(Question.id == question_id, Question.user_id == user.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    
    question.topic = data.topic
    question.difficulty = data.difficulty
    db.commit()
    db.refresh(question)
    
    try:
        update_question_metadata(question)
    except Exception as e:
        print(f"Error updating chromadb for question {question.id}: {e}")
        
    return question

@router.put("/questions/{question_id}/answer-blocks", response_model=QuestionOut)
def update_answer_blocks(question_id: int, data: AnswerBlocksUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    import os
    from pathlib import Path
    
    question = db.query(Question).filter(Question.id == question_id, Question.user_id == user.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
        
    # Gom danh sách ảnh cần xoá (những ảnh có ở mảng cũ mà không có ở mảng mới)
    old_blocks = question.answer_blocks or []
    new_blocks = data.blocks or []
    
    old_urls = set(b.get("url") for b in old_blocks if isinstance(b, dict) and b.get("type") == "image" and b.get("url"))
    new_urls = set(b.get("url") for b in new_blocks if isinstance(b, dict) and b.get("type") == "image" and b.get("url"))
    
    deleted_urls = old_urls - new_urls
    BASE_URL = "/static/answers/"
    STATIC_DIR = Path(__file__).parent.parent.parent / "static" / "answers"
    
    for url in deleted_urls:
         # Lọc lấy relative path từ url
         if url.startswith(BASE_URL):
             relative_path = url[len(BASE_URL):]
             file_path = STATIC_DIR / relative_path
             if file_path.exists():
                 try:
                     os.remove(file_path)
                 except Exception:
                     pass
    
    question.answer_blocks = data.blocks
    db.commit()
    db.refresh(question)
    return question

@router.post("/questions/{question_id}/answer-image")
async def upload_answer_image(question_id: int, file: __import__('fastapi').UploadFile = __import__('fastapi').File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    import uuid
    from pathlib import Path
    
    question = db.query(Question).filter(Question.id == question_id, Question.user_id == user.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
        
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh JPG, PNG, WEBP, HEIC")
        
    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File quá lớn, tối đa 10MB")
        
    STATIC_DIR = Path(__file__).parent.parent.parent / "static" / "answers"
    q_dir = STATIC_DIR / f"user_{user.id}" / f"question_{question_id}"
    q_dir.mkdir(parents=True, exist_ok=True)
    
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = q_dir / filename
    save_path.write_bytes(image_bytes)
    
    return {"url": f"/static/answers/user_{user.id}/question_{question_id}/{filename}"}