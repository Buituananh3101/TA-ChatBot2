import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.problem import Question
from app.models.exam import ReviewExam
from app.models.library import question_set_items
from app.services.embed_service import search_questions


# ── Spaced Repetition (SM-2) ──────────────────────────────────────────────────

def calculate_next_review(question: Question, quality: int = 3) -> None:
    """
    Tính ngày ôn tập tiếp theo theo thuật toán SM-2.

    quality: 0–5
        0 = quên hoàn toàn
        1 = nhớ nhưng rất khó
        2 = nhớ với nhiều cố gắng
        3 = nhớ được (mức chuẩn)
        4 = nhớ dễ dàng
        5 = rất dễ, nhớ ngay

    Công thức:
        - Nếu quality < 3  → reset interval về 1 ngày (quên → học lại)
        - review_count == 1 → interval = 1
        - review_count == 2 → interval = 6
        - review_count >  2 → interval = round(interval * ease_factor)
        ease_factor mới = max(1.3, ef + 0.1 − (5 − q) × 0.08)
    """
    quality = max(0, min(5, quality))  # clamp 0..5

    if quality < 3:
        # Quên → reset, học lại ngay ngày mai
        question.interval_days = 1
    else:
        count = question.review_count  # đã được tăng trước khi gọi hàm này
        if count <= 1:
            question.interval_days = 1
        elif count == 2:
            question.interval_days = 6
        else:
            question.interval_days = max(1, round((question.interval_days or 1) * (question.ease_factor or 2.5)))

    # Cập nhật ease_factor (min 1.3)
    new_ef = (question.ease_factor or 2.5) + 0.1 - (5 - quality) * 0.08
    question.ease_factor = max(1.3, round(new_ef, 4))

    question.next_review_at = datetime.utcnow() + timedelta(days=question.interval_days)


# ── Generate review exam ──────────────────────────────────────────────────────

async def generate_review_exam(
    user_id: int,
    topics: list[str],
    num_questions: int,
    db: Session,
) -> ReviewExam:
    questions_by_topic = {}
    for topic in topics:
        qs = (
            db.query(Question)
            .join(question_set_items, Question.id == question_set_items.c.question_id)
            .filter(Question.user_id == user_id, Question.topic == topic)
            .order_by(
                Question.next_review_at.asc(),   # câu đến hạn sớm nhất lên trên
                Question.last_used_at.asc(),
            )
            .limit(num_questions)
            .all()
        )
        questions_by_topic[topic] = qs

    selected: list[Question] = []
    while len(selected) < num_questions:
        added_in_round = False
        for topic in topics:
            if len(selected) >= num_questions:
                break
            if questions_by_topic[topic]:
                selected.append(questions_by_topic[topic].pop(0))
                added_in_round = True
        
        if not added_in_round:
            break

    # Trộn thứ tự câu hỏi
    random.shuffle(selected)

    # Tạo review exam
    exam = ReviewExam(
        user_id=user_id,
        title=f"Đề ôn tập — {', '.join(topics)}",
    )
    db.add(exam)
    db.flush()
    exam.questions = selected
    db.commit()
    db.refresh(exam)
    return exam