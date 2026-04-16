"""
n8n + Facebook Messenger Integration Router
============================================
Các endpoint KHÔNG yêu cầu JWT — xác thực qua N8N_SECRET header hoặc query param.
Facebook webhook xác thực qua X-Hub-Signature-256.

Endpoints:
  GET  /api/n8n/webhook              – Facebook webhook verification (challenge)
  POST /api/n8n/webhook              – Nhận tin nhắn từ Messenger, xử lý intent
  GET  /api/n8n/users-due            – Danh sách user có câu cần ôn (n8n Cron gọi)
  GET  /api/n8n/questions-due/{psid} – Lấy N câu cần ôn của user theo PSID
  POST /api/n8n/link-messenger       – Liên kết Facebook PSID với tài khoản qua email
  DELETE /api/n8n/unlink-messenger   – Hủy liên kết Messenger
"""

import re
import os
import hmac
import hashlib
import asyncio
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


def _build_due_filter(query, user_id: int, days: int = 0):
    """
    Utility: Áp dụng filter "câu đến hạn ôn" lên một query đã có sẵn.
    Giải quyết vấn đề trùng lặp logic (DRY).

    - days=0: tất cả câu đến hạn hôm nay hoặc quá hạn
    - days>0: câu chưa ôn ít nhất X ngày
    """
    now = datetime.utcnow()
    query = query.filter(Question.user_id == user_id)

    if days > 0:
        cutoff = now - timedelta(days=days)
        query = query.filter(
            (Question.last_used_at == None) | (Question.last_used_at <= cutoff)
        )
    else:
        yesterday = now - timedelta(days=1)
        query = query.filter(
            (
                (Question.next_review_at == None) & (
                    (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                )
            ) | (Question.next_review_at <= now)
        )

    return query


def _count_due_today(db: Session, user_id: int) -> int:
    """Đếm số câu đến hạn ôn hôm nay cho một user."""
    q = (
        db.query(func.count(Question.id))
        .join(question_set_items, Question.id == question_set_items.c.question_id)
    )
    q = _build_due_filter(q, user_id, days=0)
    return q.scalar() or 0


def _count_due_week(db: Session, user_id: int) -> int:
    """Đếm số câu sẽ đến hạn trong 7 ngày tới."""
    now = datetime.utcnow()
    return (
        db.query(func.count(Question.id))
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(
            Question.user_id == user_id,
            Question.next_review_at > now,
            Question.next_review_at <= now + timedelta(days=7),
        )
        .scalar() or 0
    )


async def _send_messenger_message(
    psid: str, text: str, max_retries: int = 3
) -> bool:
    """
    Gửi text message tới Facebook Messenger của user có PSID tương ứng.
    Có retry logic với exponential backoff cho HTTP 429 và 5xx.
    """
    page_id = settings.FB_PAGE_ID
    if not page_id:
        logger.error("FB_PAGE_ID chưa được cấu hình trong .env")
        return False

    url = f"https://graph.facebook.com/v19.0/{page_id}/messages"
    payload = {
        "recipient": {"id": psid},
        "message": {"text": text},
        "messaging_type": "RESPONSE",
    }

    token = settings.FB_PAGE_ACCESS_TOKEN
    if not token:
        logger.error("FB_PAGE_ACCESS_TOKEN chưa được cấu hình trong .env")
        return False

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload, headers=headers)

                if resp.status_code == 200:
                    return True

                if resp.status_code == 429 and attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning(f"FB rate limited. Retry sau {wait}s...")
                    await asyncio.sleep(wait)
                    continue

                if 500 <= resp.status_code < 600 and attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning(f"FB server error {resp.status_code}. Retry sau {wait}s...")
                    await asyncio.sleep(wait)
                    continue

                logger.error(f"FB send error: {resp.status_code} – {resp.text}")
                return False

        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
            logger.error(f"FB send failed sau {max_retries} lần thử: {e}")
            return False

    return False


async def _send_messenger_image_url(
    psid: str, image_url: str, max_retries: int = 3
) -> bool:
    """
    Gửi ảnh qua URL tới Messenger user (dùng cho câu hỏi có hình ảnh).
    """
    page_id = settings.FB_PAGE_ID
    token = settings.FB_PAGE_ACCESS_TOKEN

    if not page_id or not token:
        logger.error("Thiếu cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN")
        return False

    url = f"https://graph.facebook.com/v19.0/{page_id}/messages"
    payload = {
        "recipient": {"id": psid},
        "message": {
            "attachment": {
                "type": "image",
                "payload": {"url": image_url, "is_reusable": False}
            }
        },
        "messaging_type": "RESPONSE",
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(url, json=payload, headers=headers)

                if resp.status_code == 200:
                    return True

                if resp.status_code == 429 and attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning(f"FB rate limited (image). Retry sau {wait}s...")
                    await asyncio.sleep(wait)
                    continue

                if 500 <= resp.status_code < 600 and attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning(f"FB send image error {resp.status_code}. Retry sau {wait}s...")
                    await asyncio.sleep(wait)
                    continue

                logger.error(f"FB send image error: {resp.status_code} – {resp.text}")
                return False

        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
            logger.error(f"FB send image failed sau {max_retries} lần thử: {e}")
            return False

    return False


async def _send_messenger_file_attachment(
    psid: str, file_path: str, max_retries: int = 3
) -> bool:
    """
    Gửi file đính kèm (PDF, Image) tới Messenger user qua multipart/form-data.
    """
    page_id = settings.FB_PAGE_ID
    token = settings.FB_PAGE_ACCESS_TOKEN
    
    if not page_id or not token:
        logger.error("Thiếu cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN")
        return False

    url = f"https://graph.facebook.com/v19.0/{page_id}/messages?access_token={token}"
    
    # Payload cần bọc dạng form-data, trong đó message là một JSON string
    import json
    payload = {
        "recipient": json.dumps({"id": psid}),
        "message": json.dumps({
            "attachment": {
                "type": "file",
                "payload": {"is_reusable": False}
            }
        })
    }

    # Đọc file nhị phân
    file_name = os.path.basename(file_path)
    # Xác định mime-type
    mime_type = "application/pdf" if file_path.endswith(".pdf") else "application/octet-stream"
    
    for attempt in range(max_retries):
        try:
            with open(file_path, "rb") as f:
                files = {
                    "filedata": (file_name, f, mime_type)
                }
                
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(url, data=payload, files=files)

                    if resp.status_code == 200:
                        return True

                    if resp.status_code == 429 and attempt < max_retries - 1:
                        wait = 2 ** attempt
                        logger.warning(f"FB rate limited. Retry sau {wait}s...")
                        await asyncio.sleep(wait)
                        continue

                    if 500 <= resp.status_code < 600 and attempt < max_retries - 1:
                        wait = 2 ** attempt
                        logger.warning(f"FB file upload server error {resp.status_code}. Retry sau {wait}s...")
                        await asyncio.sleep(wait)
                        continue

                    logger.error(f"FB send file error: {resp.status_code} – {resp.text}")
                    return False

        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
            logger.error(f"FB file upload failed sau {max_retries} lần thử: {e}")
            return False

    return False


async def _log_notification(
    db: Session, user_id: int, status: str,
    message_preview: str = "", error_detail: str = ""
):
    """Ghi log thông báo vào bảng notification_logs."""
    try:
        from app.models.notification import NotificationLog
        log = NotificationLog(
            user_id=user_id,
            channel="messenger",
            status=status,
            message_preview=message_preview[:500] if message_preview else "",
            error_detail=error_detail[:500] if error_detail else None,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning(f"Không thể ghi notification log: {e}")


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

    # ── Intent: liên kết tài khoản (email pattern) — kiểm tra sớm nhất ──────
    email_match = re.search(r"[\w.\-+]+@[\w\-]+\.[a-z]{2,}", text_lower)
    if email_match:
        return {"intent": "link_account", "email": email_match.group(0)}

    # ── Intent: help — kiểm tra trước get_questions ──────────────────────────
    if any(k in text_lower for k in ["help", "hướng dẫn", "giúp", "lệnh", "hỗ trợ", "menu"]):
        return {"intent": "help"}

    # ── Intent: thống kê — kiểm tra trước get_questions ──────────────────────
    if any(k in text_lower for k in ["thống kê", "bao nhiêu", "còn lại", "tổng", "stat"]):
        return {"intent": "get_stats"}

    # ── Intent: lấy câu hỏi ôn tập ──────────────────────────────────────────
    # VD: "gửi 5 câu chưa ôn", "cho tôi 3 bài cách đây 2 ngày", "ôn tập ngay"
    # Yêu cầu phải có từ khóa liên quan rõ ràng để tránh match nhầm
    q_match = re.search(
        r"(?:g[uử]i|cho\s*(?:tôi|mình)?|lấy)\s*(\d+)?\s*(?:câu|bài|bài tập)",
        text_lower,
    )
    day_match = re.search(r"(\d+)\s*(?:ngày|hôm)", text_lower)

    # Match trực tiếp pattern hoặc có từ khóa ôn tập rõ ràng
    if q_match:
        num = int(q_match.group(1)) if q_match.group(1) else 5
        days = int(day_match.group(1)) if day_match else 0
        return {"intent": "get_questions", "num": min(num, 20), "days": days}

    # Các từ khóa shortcut không cần pattern đầy đủ
    if any(k in text_lower for k in ["ôn tập", "ôn ngay", "cần ôn", "review", "ôn bài"]):
        days = int(day_match.group(1)) if day_match else 0
        # Tìm số lượng nếu có
        num_match = re.search(r"(\d+)", text_lower)
        num = int(num_match.group(1)) if num_match else 5
        return {"intent": "get_questions", "num": min(num, 20), "days": days}

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
    Verify X-Hub-Signature-256 trước, sau đó xử lý: đọc PSID + text → phân tích intent → trả lời.
    """
    # ── Xác thực chữ ký từ Facebook ──────────────────────────────────────────
    raw_body = await request.body()

    if settings.FB_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(
            settings.FB_APP_SECRET.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            logger.warning("Facebook webhook: chữ ký không hợp lệ!")
            raise HTTPException(status_code=403, detail="Invalid signature")

    import json
    body = json.loads(raw_body)

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
    )
    query = _build_due_filter(query, user_id, days)

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

    # Xác định user details
    user = db.query(User).filter(User.id == user_id).first()
    user_name = user.name if user else "Học sinh"
    base_url = os.getenv("BASE_URL", "http://127.0.0.1:8000")

    # ── Bước 1: Thông báo câu nào kèm hình ảnh (ảnh nằm trong PDF) ────────────
    image_indices = [
        str(idx) for idx, q in enumerate(questions, start=1)
        if q.has_image and q.source_image_url
    ]
    if image_indices:
        await _send_messenger_message(
            psid,
            f"📷 Lưu ý: Câu {', '.join(image_indices)} có kèm hình ảnh đề gốc trong file PDF."
        )

    # ── Bước 2: Sinh và gửi file PDF tổng hợp ───────────────────────────────
    await _send_messenger_message(
        psid,
        "⏳ Đang biên soạn file PDF tổng hợp, vui lòng đợi vài giây..."
    )

    from app.services.pdf_service import generate_questions_pdf
    pdf_path = await generate_questions_pdf(questions, user_name, base_url)

    if not pdf_path or not os.path.exists(pdf_path):
        await _send_messenger_message(psid, "❌ Xin lỗi, đã có lỗi kết xuất PDF xảy ra. Vui lòng thử lại sau.")
    else:
        success = await _send_messenger_file_attachment(psid, pdf_path)
        if success:
            await _send_messenger_message(psid, "💡 Đăng nhập web app để đối chiếu đáp án và đánh dấu đã ôn nhé!")
        else:
            await _send_messenger_message(psid, "❌ Rất tiếc, Facebook từ chối file đính kèm. Vui lòng kiểm tra lại quyền.")

        try:
            os.remove(pdf_path)
        except Exception:
            pass

    # Log notification
    await _log_notification(
        db, user_id, "sent",
        message_preview=f"Gửi PDF {len(questions)} câu ôn tập qua Messenger"
    )


async def _handle_get_stats(psid: str, user_id: int, name: str, db: Session):
    """Gửi thống kê câu cần ôn về Messenger."""
    due_today = _count_due_today(db, user_id)
    due_week = _count_due_week(db, user_id)

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

    Trả về {"data": [...]} để tương thích với n8n Item Lists node.
    """
    users_with_psid = (
        db.query(User)
        .filter(User.messenger_psid != None)
        .all()
    )

    result = []
    for user in users_with_psid:
        due_today = _count_due_today(db, user.id)
        due_week = _count_due_week(db, user.id)

        result.append({
            "psid": user.messenger_psid,
            "user_id": user.id,
            "name": user.name,
            "due_today": due_today,
            "due_next_7_days": due_week,
            "should_notify": due_today > 0,
        })

    return {"data": result}


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

    query = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
    )
    query = _build_due_filter(query, user.id, days)

    questions = (
        query
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


# ── DELETE /unlink-messenger — Hủy liên kết Messenger ────────────────────────

class UnlinkMessengerRequest(BaseModel):
    psid: str | None = None
    email: str | None = None


@router.delete("/unlink-messenger", dependencies=[Depends(_verify_n8n_secret)])
def unlink_messenger(body: UnlinkMessengerRequest, db: Session = Depends(get_db)):
    """
    Hủy liên kết Facebook Messenger khỏi tài khoản.
    Có thể tìm user bằng PSID hoặc email.
    """
    user = None
    if body.psid:
        user = db.query(User).filter(User.messenger_psid == body.psid).first()
    elif body.email:
        user = db.query(User).filter(User.email == body.email).first()

    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    if not user.messenger_psid:
        return {"message": "Tài khoản chưa liên kết Messenger"}

    user.messenger_psid = None
    db.commit()

    return {"message": f"Đã hủy liên kết Messenger cho tài khoản '{user.name}'"}


# ── GET /messenger-status — Kiểm tra trạng thái liên kết (Frontend gọi) ─────

@router.get("/messenger-status")
def get_messenger_status(db: Session = Depends(get_db)):
    """
    Frontend gọi để kiểm tra trạng thái Messenger cho user hiện tại.
    Yêu cầu JWT auth thông qua query param user_id (hoặc call riêng).
    """
    from app.services.auth_service import get_current_user
    # Endpoint này sẽ được gọi từ frontend với JWT,
    # nhưng vì router không dùng JWT dependency mặc định,
    # ta expose endpoint riêng ở auth router thay vì ở đây.
    # Xem thêm: router auth GET /auth/messenger-status
    raise HTTPException(status_code=501, detail="Dùng GET /api/auth/messenger-status thay thế")
