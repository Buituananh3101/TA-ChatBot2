from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, timedelta
from app.database import get_db
from app.models.user import User
from app.models.problem import Question, SourceExam
from app.models.library import question_set_items
from app.models.study_session import StudySession
from app.services.auth_service import get_current_user

router = APIRouter(tags=["Stats"])


@router.get("/overview")
def get_stats_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)

    # ── Tổng câu hỏi trong kho ──────────────────────────────────────────
    total_questions = db.query(Question).filter(Question.user_id == user.id).count()

    # ── Đã ôn ít nhất 1 lần ─────────────────────────────────────────────
    reviewed_questions = (
        db.query(Question)
        .filter(Question.user_id == user.id, Question.last_used_at != None)
        .count()
    )

    # ── Câu cần ôn hôm nay (dùng next_review_at nếu có) ─────────────────
    due_today = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user.id,
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                )
            ) | (Question.next_review_at <= now),
        )
        .count()
    )

    # ── Câu đến hạn ngày mai ─────────────────────────────────────────────
    tomorrow_end = now + timedelta(days=1)
    due_tomorrow = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user.id,
            Question.next_review_at > now,
            Question.next_review_at <= tomorrow_end,
        )
        .count()
    )

    # ── Câu đến hạn trong 7 ngày tới ─────────────────────────────────────
    week_end = now + timedelta(days=7)
    due_this_week = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user.id,
            Question.next_review_at > now,
            Question.next_review_at <= week_end,
        )
        .count()
    )

    # ── Streak ──────────────────────────────────────────────────────────
    streak = _calculate_streak(db, user.id)

    # ── Thống kê theo chủ đề ────────────────────────────────────────────
    topic_rows = (
        db.query(
            Question.topic,
            func.count(Question.id).label("total"),
            func.sum(case((Question.last_used_at != None, 1), else_=0)).label("reviewed"),
            func.avg(Question.review_count).label("avg_review"),
        )
        .filter(Question.user_id == user.id)
        .group_by(Question.topic)
        .all()
    )

    topics = []
    for row in topic_rows:
        topics.append({
            "topic": row.topic or "Khác",
            "total": row.total,
            "reviewed": int(row.reviewed or 0),
            "remaining": row.total - int(row.reviewed or 0),
            "avg_review": round(float(row.avg_review or 0), 1),
        })

    # ── Phân bố độ khó ──────────────────────────────────────────────────
    diff_rows = (
        db.query(
            Question.difficulty,
            func.count(Question.id).label("total"),
            func.sum(case((Question.last_used_at == None, 1), else_=0)).label("not_reviewed"),
        )
        .filter(Question.user_id == user.id)
        .group_by(Question.difficulty)
        .all()
    )

    difficulty = {
        row.difficulty: {
            "total": row.total,
            "not_reviewed": int(row.not_reviewed or 0),
        }
        for row in diff_rows
    }

    # ── Heatmap 12 tuần ─────────────────────────────────────────────────
    start_date = now - timedelta(weeks=12)
    heatmap_rows = (
        db.query(
            func.date(Question.last_used_at).label("day"),
            func.count(Question.id).label("count"),
        )
        .filter(
            Question.user_id == user.id,
            Question.last_used_at >= start_date,
        )
        .group_by(func.date(Question.last_used_at))
        .all()
    )
    heatmap = {str(row.day): row.count for row in heatmap_rows}

    # ── Câu ôn theo 8 tuần ──────────────────────────────────────────────
    weekly = []
    for i in range(7, -1, -1):
        week_start = now - timedelta(weeks=i + 1)
        week_end_w = now - timedelta(weeks=i)
        count = (
            db.query(Question)
            .filter(
                Question.user_id == user.id,
                Question.last_used_at >= week_start,
                Question.last_used_at < week_end_w,
            )
            .count()
        )
        weekly.append({"label": f"T{8 - i}", "count": count})

    # ── Due forecast: 14 ngày tới (cho biểu đồ dự báo) ──────────────────
    due_forecast = []
    for i in range(14):
        day_start = now + timedelta(days=i)
        day_end = now + timedelta(days=i + 1)
        count = (
            db.query(Question)
            .join(question_set_items, Question.id == question_set_items.c.question_id)
            .filter(
                Question.user_id == user.id,
                Question.next_review_at >= day_start,
                Question.next_review_at < day_end,
            )
            .count()
        )
        due_forecast.append({
            "label": day_start.strftime("%d/%m"),
            "count": count,
        })

    # ── Thời gian học tập (StudySession) ────────────────────────────────
    total_secs = (
        db.query(func.sum(StudySession.duration_seconds))
        .filter(
            StudySession.user_id == user.id,
            StudySession.duration_seconds != None,
        )
        .scalar() or 0
    )

    # Thời gian học 7 ngày gần nhất theo ngày
    daily_time = []
    for i in range(6, -1, -1):
        day_start = (
            now.replace(hour=0, minute=0, second=0, microsecond=0)
            - timedelta(days=i)
        )
        day_end = day_start + timedelta(days=1)
        secs = (
            db.query(func.sum(StudySession.duration_seconds))
            .filter(
                StudySession.user_id == user.id,
                StudySession.started_at >= day_start,
                StudySession.started_at < day_end,
                StudySession.duration_seconds != None,
            )
            .scalar() or 0
        )
        daily_time.append({
            "label": day_start.strftime("%d/%m"),
            "minutes": round(secs / 60, 1),
        })

    # Thời gian học theo từng trang
    page_time_rows = (
        db.query(
            StudySession.page,
            func.sum(StudySession.duration_seconds).label("total_secs"),
        )
        .filter(
            StudySession.user_id == user.id,
            StudySession.duration_seconds != None,
        )
        .group_by(StudySession.page)
        .all()
    )
    page_time = {
        row.page: round((row.total_secs or 0) / 60, 1)
        for row in page_time_rows
    }

    # ── Badges ──────────────────────────────────────────────────────────
    badges = _calculate_badges(
        total_questions, reviewed_questions, streak,
        round(total_secs / 60), db, user.id,
    )

    return {
        # Tổng quan
        "total_questions": total_questions,
        "reviewed_questions": reviewed_questions,
        "due_today": due_today,
        "due_tomorrow": due_tomorrow,
        "due_this_week": due_this_week,
        "streak": streak,
        # Charts
        "topics": topics,
        "difficulty": difficulty,
        "heatmap": heatmap,
        "weekly": weekly,
        "due_forecast": due_forecast,
        # Badges
        "badges": badges,
        # User info
        "user_name": user.name,
        "user_grade": user.grade,
        # Thời gian học
        "total_study_minutes": round(total_secs / 60),
        "daily_time": daily_time,
        "page_time": page_time,
    }


# ── Session tracking endpoints ───────────────────────────────────────────────

@router.post("/session/start")
def start_session(
    page: str = "chat",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = StudySession(user_id=user.id, page=page)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id}


@router.post("/session/end/{session_id}")
def end_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = (
        db.query(StudySession)
        .filter(StudySession.id == session_id, StudySession.user_id == user.id)
        .first()
    )
    if not session:
        return {"ok": False}

    now = datetime.utcnow()
    session.ended_at = now
    diff = (now - session.started_at).total_seconds()
    session.duration_seconds = min(int(diff), 7200)  # tối đa 2 tiếng
    db.commit()
    return {"ok": True, "duration_seconds": session.duration_seconds}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _calculate_streak(db: Session, user_id: int) -> int:
    today = datetime.utcnow().date()
    streak = 0
    check_date = today

    # Kiểm tra xem hôm nay đã có hoạt động chưa
    def has_activity(d):
        start = datetime.combine(d, datetime.min.time())
        end = start + timedelta(days=1)
        return db.query(Question).filter(
            Question.user_id == user_id,
            Question.last_used_at >= start,
            Question.last_used_at < end
        ).count() > 0

    # Nếu hôm nay chưa học, kiểm tra bắt đầu từ hôm qua
    if not has_activity(check_date):
        check_date -= timedelta(days=1)

    while streak < 365:
        if has_activity(check_date):
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break
    return streak


def _calculate_badges(total, reviewed, streak, total_minutes, db, user_id) -> list:
    badges = []
    exam_count = db.query(SourceExam).filter(SourceExam.user_id == user_id).count()

    badges.append({"id": "first_upload", "label": "Upload đề đầu tiên",   "icon": "📸", "earned": exam_count >= 1})
    badges.append({"id": "reviewed_10", "label": "Ôn xong 10 câu",        "icon": "📖", "earned": reviewed >= 10})
    badges.append({"id": "reviewed_50", "label": "Ôn xong 50 câu",        "icon": "💯", "earned": reviewed >= 50})
    badges.append({"id": "reviewed_100","label": "Ôn xong 100 câu",       "icon": "🏆", "earned": reviewed >= 100})
    badges.append({"id": "streak_3",    "label": "Học 3 ngày liên tiếp",  "icon": "🔥", "earned": streak >= 3})
    badges.append({"id": "streak_7",    "label": "Học 7 ngày liên tiếp",  "icon": "⚡", "earned": streak >= 7})
    badges.append({"id": "streak_30",   "label": "Học 30 ngày liên tiếp", "icon": "👑", "earned": streak >= 30})
    badges.append({"id": "bank_50",     "label": "Kho 50 câu hỏi",        "icon": "📚", "earned": total >= 50})
    badges.append({"id": "time_60",     "label": "Học tổng 1 giờ",        "icon": "⏱", "earned": total_minutes >= 60})
    badges.append({"id": "time_600",    "label": "Học tổng 10 giờ",       "icon": "🎯", "earned": total_minutes >= 600})

    return badges