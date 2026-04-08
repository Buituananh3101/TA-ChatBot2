import random
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.problem import Question
from app.models.exam import ReviewExam
from app.models.library import question_set_items
from app.services.embed_service import search_questions

async def generate_review_exam(
    user_id: int,
    topics: list[str],
    num_questions: int,
    db: Session
) -> ReviewExam:
    selected: list[Question] = []
    per_topic = max(1, num_questions // len(topics))
    remainder = num_questions - per_topic * len(topics)

    for i, topic in enumerate(topics):
        limit = per_topic + (1 if i < remainder else 0)

        # Lấy candidate IDs từ Chroma
        candidate_ids = search_questions(user_id, topic, n=limit * 3)

        if not candidate_ids:
            # fallback: lấy thẳng từ MySQL nếu Chroma chưa có
            qs = (db.query(Question)
                    .join(question_set_items, Question.id == question_set_items.c.question_id)
                    .filter(Question.user_id == user_id, Question.topic == topic)
                    # .order_by(Question.last_used_at.asc().nullsfirst())
                    .order_by(Question.last_used_at.asc()) # Xóa phần .nullsfirst() đi
                    .limit(limit).all())
        else:
            qs = (db.query(Question)
                    .join(question_set_items, Question.id == question_set_items.c.question_id)
                    .filter(Question.id.in_(candidate_ids))
                    # .order_by(Question.last_used_at.asc().nullsfirst())
                    .order_by(Question.last_used_at.asc()) # Xóa phần .nullsfirst() đi
                    .limit(limit).all())

        selected.extend(qs)

    # Trộn thứ tự câu hỏi
    random.shuffle(selected)

    # Tạo review exam
    exam = ReviewExam(
        user_id=user_id,
        title=f"Đề ôn tập - {', '.join(topics)}"
    )
    db.add(exam)
    db.flush()

    exam.questions = selected

    db.commit()
    db.refresh(exam)
    return exam
