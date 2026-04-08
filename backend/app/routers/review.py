from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.exam import ReviewExam
from app.schemas.problem import ReviewRequest, ReviewExamOut
from app.services.auth_service import get_current_user
from app.services.review_service import generate_review_exam
from app.models.problem import Question
from app.schemas.problem import QuestionOut
from datetime import datetime, timedelta

router = APIRouter(tags=["Review"])

@router.get("/needs-review", response_model=list[QuestionOut])
def get_needs_review(days: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.library import question_set_items
    threshold = datetime.utcnow() - timedelta(days=days)
    questions = db.query(Question).join(
        question_set_items, Question.id == question_set_items.c.question_id
    ).filter(
        Question.user_id == user.id,
        (Question.last_used_at == None) | (Question.last_used_at <= threshold)
    ).order_by(Question.last_used_at.asc()).all()
    return questions

@router.post("/questions/{question_id}/mark-reviewed")
def mark_question_reviewed(question_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    question = db.query(Question).filter(Question.id == question_id, Question.user_id == user.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    
    now = datetime.utcnow()
    question.last_used_at = now
    question.review_count += 1
    db.commit()
    
    return {"message": "Đã cập nhật ngày ôn tập", "last_used_at": now.isoformat(), "review_count": question.review_count}

@router.post("/generate", response_model=ReviewExamOut)
async def generate(body: ReviewRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    exam = await generate_review_exam(user.id, body.topics, body.num_questions, db)
    return exam

@router.get("/exams", response_model=list[ReviewExamOut])
def list_review_exams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (db.query(ReviewExam)
              .filter(ReviewExam.user_id == user.id)
              .order_by(ReviewExam.created_at.desc())
              .all())

@router.get("/exams/{exam_id}", response_model=ReviewExamOut)
def get_review_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    exam = db.query(ReviewExam).filter(ReviewExam.id == exam_id, ReviewExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề ôn tập")
    return exam

@router.delete("/exams/{exam_id}", status_code=204)
def delete_review_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    exam = db.query(ReviewExam).filter(ReviewExam.id == exam_id, ReviewExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề ôn tập")
    
    # Xoá liên kết Many-to-Many trước khi xóa (tránh lỗi Foreign Key constraint)
    exam.questions = []
    db.commit()
    
    db.delete(exam)
    db.commit()

