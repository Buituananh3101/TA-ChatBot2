from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.exam import ReviewExam
from app.schemas.problem import ReviewRequest, ReviewExamOut, MarkReviewedRequest
from app.services.auth_service import get_current_user
from app.services.review_service import generate_review_exam, calculate_next_review
from app.models.problem import Question
from app.schemas.problem import QuestionOut
from app.config import settings
from datetime import datetime, timedelta

router = APIRouter(tags=["Review"])


# ── Câu hỏi cần ôn (dựa vào next_review_at) ─────────────────────────────────

@router.get("/needs-review", response_model=list[QuestionOut])
def get_needs_review(
    days: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Trả về câu hỏi trong thư viện đã đến hạn ôn tập.
    Dùng next_review_at nếu có, fallback về last_used_at + days.
    days=0 → tất cả câu đến hạn hôm nay hoặc quá hạn.
    """
    from app.models.library import question_set_items
    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    questions = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user.id,
            # Ưu tiên next_review_at; nếu chưa có thì dùng last_used_at logic cũ
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= cutoff)
                )
            ) | (Question.next_review_at <= now),
        )
        .order_by(Question.next_review_at.asc(), Question.last_used_at.asc())
        .all()
    )
    return questions


# ── Đánh dấu đã ôn (SM-2) ────────────────────────────────────────────────────

@router.post("/questions/{question_id}/mark-reviewed")
def mark_question_reviewed(
    question_id: int,
    body: MarkReviewedRequest = MarkReviewedRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Đánh dấu câu hỏi đã ôn và tính lịch ôn tiếp theo (SM-2).
    quality 0–5: 0=quên, 3=nhớ được (mặc định), 5=rất dễ.
    """
    question = (
        db.query(Question)
        .filter(Question.id == question_id, Question.user_id == user.id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")

    question.last_used_at = datetime.utcnow()
    question.review_count = (question.review_count or 0) + 1

    # Tính next_review_at theo SM-2
    calculate_next_review(question, quality=body.quality)

    db.commit()

    return {
        "message": "Đã cập nhật",
        "last_used_at": question.last_used_at.isoformat(),
        "review_count": question.review_count,
        "next_review_at": question.next_review_at.isoformat() if question.next_review_at else None,
        "interval_days": question.interval_days,
        "ease_factor": question.ease_factor,
    }


# ── Tạo đề ôn ────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=ReviewExamOut)
async def generate(
    body: ReviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exam = await generate_review_exam(user.id, body.topics, body.num_questions, db)
    return exam


# ── CRUD ReviewExam ───────────────────────────────────────────────────────────

@router.get("/exams", response_model=list[ReviewExamOut])
def list_review_exams(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(ReviewExam)
        .filter(ReviewExam.user_id == user.id)
        .order_by(ReviewExam.created_at.desc())
        .all()
    )


@router.get("/exams/{exam_id}", response_model=ReviewExamOut)
def get_review_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exam = (
        db.query(ReviewExam)
        .filter(ReviewExam.id == exam_id, ReviewExam.user_id == user.id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề ôn tập")
    return exam


@router.delete("/exams/{exam_id}", status_code=204)
def delete_review_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exam = (
        db.query(ReviewExam)
        .filter(ReviewExam.id == exam_id, ReviewExam.user_id == user.id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề ôn tập")
    exam.questions = []   # xóa M2M trước
    db.commit()
    db.delete(exam)
    db.commit()


# ── N8N / Notification endpoint ──────────────────────────────────────────────

@router.get("/due-summary/{user_id}")
def due_summary_for_notification(
    user_id: int,
    secret: str,
    db: Session = Depends(get_db),
):
    """
    Endpoint không cần JWT, dùng NOTIFICATION_SECRET để xác thực.
    n8n Cron → GET /api/review/due-summary/{user_id}?secret=xxx
    Trả về thông tin để n8n gửi email/Telegram nhắc nhở.
    """
    if secret != getattr(settings, "NOTIFICATION_SECRET", None):
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.models.library import question_set_items

    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)

    # Due hôm nay (next_review_at <= now hoặc chưa từng ôn)
    due_today = (
        db.query(func.count(Question.id))
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user_id,
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                )
            ) | (Question.next_review_at <= now),
        )
        .scalar() or 0
    )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại")

    # Câu sắp đến hạn trong 7 ngày tới
    due_week = (
        db.query(func.count(Question.id))
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user_id,
            Question.next_review_at > now,
            Question.next_review_at <= now + timedelta(days=7),
        )
        .scalar() or 0
    )

    return {
        "user_id": user_id,
        "name": user.name,
        "email": user.email,
        "due_today": due_today,
        "due_next_7_days": due_week,
        "should_notify": due_today > 0,
    }