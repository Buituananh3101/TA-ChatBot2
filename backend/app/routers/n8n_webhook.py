"""
n8n + Facebook Messenger Integration Router
============================================
Các endpoint KHÔNG yêu cầu JWT — xác thực qua N8N_SECRET header hoặc query param.

Endpoints:
  GET  /api/n8n/webhook          – Facebook webhook verification (challenge)
  POST /api/n8n/webhook          – Nhận tin nhắn từ Messenger, xử lý intent
  GET  /api/n8n/users-due        – Danh sách user có câu cần ôn (n8n Cron gọi)
  GET  /api/n8n/questions-due/{psid} – Lấy N câu cần ôn của user theo PSID
  POST /api/n8n/link-messenger   – Liên kết Facebook PSID với tài khoản qua email
"""

import re
import httpx
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.problem import Question
from app.models.library import question_set_items
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["n8n / Messenger"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_n8n_secret(secret: str = Query(..., alias="secret")):
    """Dependency: kiểm tra secret query param."""
    if secret != settings.N8N_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: invalid secret")


async def _send_messenger_message(psid: str, text: str) -> bool:
    """Gửi text message tới Facebook Messenger của user có PSID tương ứng."""
    url = "https://graph.facebook.com/v19.0/891572780710628/messages"
    payload = {
        "recipient": {"id": psid},
        "message": {"text": text},
        "messaging_type": "RESPONSE",
    }
    
    token = settings.FB_PAGE_ACCESS_TOKEN
    logger.info(f"=== DEBUG: Token đang dùng là: '{token[:10]}...' Độ dài: {len(token)} ===")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.error(f"FB send error: {resp.status_code} – {resp.text}")
                return False
        return True
    except Exception as e:
        logger.error(f"FB send exception: {e}")
        return False


def _parse_intent(text: str) -> dict:
    """
    Phân tích ý định người dùng từ tin nhắn thô.
    Trả về dict với 'intent' và các tham số liên quan.

    Các intent hiện hỗ trợ:
      - 'get_questions'  : gửi câu hỏi cần ôn (có thể kèm số lượng + số ngày)
      - 'get_stats'      : xem thống kê câu cần ôn
      - 'link_account'   : liên kết tài khoản qua email
      - 'help'           : hướng dẫn sử dụng
      - 'unknown'        : không nhận diện được
    """
    text_lower = text.lower().strip()

    # Intent: lấy câu hỏi ôn tập
    # VD: "gửi 5 câu chưa ôn", "cho tôi 3 bài cách đây 2 ngày", "ôn tập ngay"
    q_match = re.search(
        r"(?:g[uử]i|cho\s*(?:tôi|mình)?|lấy|xem)\s*(\d+)?\s*(?:câu|bài|bài tập)?",
        text_lower,
    )
    day_match = re.search(r"(\d+)\s*(?:ngày|hôm)", text_lower)

    if q_match or any(k in text_lower for k in ["ôn tập", "ôn ngay", "cần ôn", "review"]):
        num = int(q_match.group(1)) if q_match and q_match.group(1) else 5
        days = int(day_match.group(1)) if day_match else 0
        return {"intent": "get_questions", "num": min(num, 20), "days": days}

    # Intent: thống kê
    if any(k in text_lower for k in ["thống kê", "bao nhiêu", "còn lại", "tổng", "stat"]):
        return {"intent": "get_stats"}

    # Intent: liên kết tài khoản (email pattern)
    email_match = re.search(r"[\w.\-+]+@[\w\-]+\.[a-z]{2,}", text_lower)
    if email_match:
        return {"intent": "link_account", "email": email_match.group(0)}

    # Intent: help
    if any(k in text_lower for k in ["help", "hướng dẫn", "giúp", "lệnh", "hỗ trợ"]):
        return {"intent": "help"}

    return {"intent": "unknown"}


# ── Facebook Webhook Verification (GET) ──────────────────────────────────────

@router.get("/webhook")
def facebook_verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """
    Facebook gọi endpoint này 1 lần để xác thực webhook.
    Phải trả về hub.challenge nếu verify_token khớp.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.FB_VERIFY_TOKEN:
        logger.info("Facebook webhook verified successfully!")
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed: token mismatch")


# ── Facebook Webhook – Nhận tin nhắn (POST) ──────────────────────────────────

@router.post("/webhook")
async def facebook_receive_message(request: Request, db: Session = Depends(get_db)):
    """
    Facebook gửi tất cả sự kiện Messenger tới đây.
    Xử lý: đọc PSID + text → phân tích intent → trả lời.
    """
    body = await request.json()

    if body.get("object") != "page":
        return {"status": "ignored"}

    for entry in body.get("entry", []):
        for event in entry.get("messaging", []):
            sender_psid = event.get("sender", {}).get("id")
            if not sender_psid:
                continue

            # Chỉ xử lý message (bỏ qua delivery, read, postback...)
            message = event.get("message", {})
            text = message.get("text", "").strip()
            if not text:
                continue

            logger.info(f"Messenger [{sender_psid}]: {text}")

            # Tìm user theo PSID
            user = db.query(User).filter(User.messenger_psid == sender_psid).first()
            intent = _parse_intent(text)

            # Chưa liên kết tài khoản
            if not user:
                if intent["intent"] == "link_account":
                    # Người dùng gõ email để liên kết
                    target = db.query(User).filter(User.email == intent["email"]).first()
                    if not target:
                        await _send_messenger_message(
                            sender_psid,
                            "❌ Không tìm thấy tài khoản với email đó. Vui lòng kiểm tra lại."
                        )
                    elif target.messenger_psid:
                        await _send_messenger_message(
                            sender_psid,
                            "⚠️ Email này đã được liên kết với một tài khoản Messenger khác."
                        )
                    else:
                        target.messenger_psid = sender_psid
                        db.commit()
                        await _send_messenger_message(
                            sender_psid,
                            f"✅ Liên kết thành công! Xin chào {target.name} 👋\n\n"
                            "Từ giờ bạn có thể:\n"
                            "• Gõ 'gửi 5 câu chưa ôn 2 ngày' để nhận câu hỏi\n"
                            "• Gõ 'thống kê' để xem tổng quan\n"
                            "• Gõ 'hướng dẫn' để xem lệnh"
                        )
                else:
                    await _send_messenger_message(
                        sender_psid,
                        "👋 Xin chào! Vui lòng liên kết tài khoản của bạn.\n\n"
                        "Hãy gõ địa chỉ EMAIL bạn đã đăng ký trên hệ thống:"
                    )
                continue

            # Đã liên kết – xử lý theo intent
            if intent["intent"] == "get_questions":
                await _handle_get_questions(sender_psid, user.id, intent, db)

            elif intent["intent"] == "get_stats":
                await _handle_get_stats(sender_psid, user.id, user.name, db)

            elif intent["intent"] == "help":
                await _send_messenger_message(
                    sender_psid,
                    "📚 Hướng dẫn sử dụng:\n\n"
                    "• 'gửi 5 câu chưa ôn' → Nhận 5 câu cần ôn ngay\n"
                    "• 'gửi 3 câu cách đây 2 ngày' → Câu chưa ôn 2+ ngày\n"
                    "• 'thống kê' → Xem số câu cần ôn hôm nay\n"
                    "• 'hướng dẫn' → Hiện menu này"
                )
            else:
                await _send_messenger_message(
                    sender_psid,
                    "🤔 Tôi chưa hiểu yêu cầu đó.\n\n"
                    "Thử gõ: 'gửi 5 câu chưa ôn' hoặc 'hướng dẫn'"
                )

    return {"status": "ok"}


async def _handle_get_questions(
    psid: str, user_id: int, intent: dict, db: Session
):
    """Lấy câu hỏi cần ôn và gửi về Messenger."""
    num = intent.get("num", 5)
    days = intent.get("days", 0)

    now = datetime.utcnow()

    query = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(Question.user_id == user_id)
    )

    if days > 0:
        # Lọc câu chưa ôn cách đây ít nhất `days` ngày
        cutoff = now - timedelta(days=days)
        query = query.filter(
            (Question.last_used_at == None) | (Question.last_used_at <= cutoff)
        )
    else:
        # Tất cả câu đến hạn ôn (next_review_at <= now hoặc chưa từng ôn)
        yesterday = now - timedelta(days=1)
        query = query.filter(
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                )
            ) | (Question.next_review_at <= now)
        )

    questions = (
        query
        .order_by(Question.next_review_at.asc(), Question.last_used_at.asc())
        .limit(num)
        .all()
    )

    if not questions:
        day_text = f" (chưa ôn {days}+ ngày)" if days > 0 else ""
        await _send_messenger_message(
            psid,
            f"🎉 Tuyệt vời! Bạn không có câu nào cần ôn{day_text}. Tiếp tục duy trì nhé!"
        )
        return

    day_text = f" (chưa ôn {days}+ ngày)" if days > 0 else ""
    header = f"📝 {len(questions)} câu cần ôn tập{day_text}:\n{'─' * 30}\n"

    # Giới hạn 2000 ký tự mỗi tin nhắn Messenger
    messages = []
    current = header
    for i, q in enumerate(questions, 1):
        topic_tag = f"[{q.topic}] " if q.topic else ""
        last_str = ""
        if q.last_used_at:
            delta = now - q.last_used_at
            last_str = f" (ôn {delta.days} ngày trước)"
        line = f"\n{i}. {topic_tag}{q.content[:200]}{last_str}\n"
        if len(current) + len(line) > 1900:
            messages.append(current)
            current = line
        else:
            current += line

    if current:
        messages.append(current)

    for msg in messages:
        await _send_messenger_message(psid, msg)

    await _send_messenger_message(
        psid,
        "💡 Đăng nhập app để ôn tập và đánh dấu đã ôn nhé!"
    )


async def _handle_get_stats(psid: str, user_id: int, name: str, db: Session):
    """Gửi thống kê câu cần ôn về Messenger."""
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    next_week = now + timedelta(days=7)

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

    due_week = (
        db.query(func.count(Question.id))
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user_id,
            Question.next_review_at > now,
            Question.next_review_at <= next_week,
        )
        .scalar() or 0
    )

    emoji = "🔥" if due_today > 0 else "✅"
    await _send_messenger_message(
        psid,
        f"{emoji} Thống kê ôn tập của {name}:\n\n"
        f"📌 Cần ôn hôm nay: {due_today} câu\n"
        f"📅 Sắp đến hạn (7 ngày tới): {due_week} câu\n\n"
        + (f"👉 Gõ 'gửi {min(due_today, 10)} câu' để bắt đầu ngay!" if due_today > 0
           else "Hôm nay không có câu nào đến hạn. Làm tốt lắm! 🎊")
    )


# ── GET /users-due — n8n Cron gọi để lấy danh sách user cần thông báo ────────

@router.get("/users-due", dependencies=[Depends(_verify_n8n_secret)])
def get_users_due(db: Session = Depends(get_db)):
    """
    n8n Schedule Trigger gọi endpoint này mỗi ngày để lấy danh sách
    users đã liên kết Messenger và có câu cần ôn hôm nay.
    """
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)

    # Lấy tất cả user đã liên kết messenger
    users_with_psid = (
        db.query(User)
        .filter(User.messenger_psid != None)
        .all()
    )

    result = []
    for user in users_with_psid:
        due_today = (
            db.query(func.count(Question.id))
            .join(question_set_items, Question.id == question_set_items.c.question_id)
            .filter(
                Question.user_id == user.id,
                (
                    (Question.next_review_at == None) & (
                        (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                    )
                ) | (Question.next_review_at <= now),
            )
            .scalar() or 0
        )

        due_week = (
            db.query(func.count(Question.id))
            .join(question_set_items, Question.id == question_set_items.c.question_id)
            .filter(
                Question.user_id == user.id,
                Question.next_review_at > now,
                Question.next_review_at <= now + timedelta(days=7),
            )
            .scalar() or 0
        )

        result.append({
            "psid": user.messenger_psid,
            "user_id": user.id,
            "name": user.name,
            "due_today": due_today,
            "due_next_7_days": due_week,
            "should_notify": due_today > 0,
        })

    return result


# ── GET /questions-due/{psid} — n8n lấy câu hỏi theo PSID ───────────────────

@router.get("/questions-due/{psid}", dependencies=[Depends(_verify_n8n_secret)])
def get_questions_due_by_psid(
    psid: str,
    n: int = Query(default=5, ge=1, le=20, description="Số câu cần lấy"),
    days: int = Query(default=0, ge=0, description="Lọc câu chưa ôn ít nhất X ngày"),
    db: Session = Depends(get_db),
):
    """
    Lấy N câu cần ôn của user theo PSID.
    days=0 → tất cả câu đến hạn hôm nay
    days=2 → câu chưa ôn ít nhất 2 ngày (last_used_at <= now - 2 days)
    """
    user = db.query(User).filter(User.messenger_psid == psid).first()
    if not user:
        raise HTTPException(status_code=404, detail="PSID chưa được liên kết với tài khoản nào")

    now = datetime.utcnow()

    base_q = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(Question.user_id == user.id)
    )

    if days > 0:
        cutoff = now - timedelta(days=days)
        base_q = base_q.filter(
            (Question.last_used_at == None) | (Question.last_used_at <= cutoff)
        )
    else:
        yesterday = now - timedelta(days=1)
        base_q = base_q.filter(
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                )
            ) | (Question.next_review_at <= now)
        )

    questions = (
        base_q
        .order_by(Question.next_review_at.asc(), Question.last_used_at.asc())
        .limit(n)
        .all()
    )

    return [
        {
            "id": q.id,
            "content": q.content,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "last_used_at": q.last_used_at.isoformat() if q.last_used_at else None,
            "next_review_at": q.next_review_at.isoformat() if q.next_review_at else None,
            "review_count": q.review_count,
        }
        for q in questions
    ]


# ── POST /link-messenger — Liên kết PSID với email ───────────────────────────

class LinkMessengerRequest(BaseModel):
    email: str
    psid: str


@router.post("/link-messenger", dependencies=[Depends(_verify_n8n_secret)])
def link_messenger(body: LinkMessengerRequest, db: Session = Depends(get_db)):
    """
    Liên kết Facebook PSID với tài khoản user qua email.
    Gọi từ n8n sau khi người dùng xác nhận email lần đầu.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản với email này")

    if user.messenger_psid and user.messenger_psid != body.psid:
        raise HTTPException(status_code=409, detail="Tài khoản đã được liên kết với PSID khác")

    existing = db.query(User).filter(User.messenger_psid == body.psid).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=409, detail="PSID này đã liên kết với tài khoản khác")

    user.messenger_psid = body.psid
    db.commit()

    return {"message": f"Đã liên kết thành công tài khoản '{user.name}' với Messenger"}
