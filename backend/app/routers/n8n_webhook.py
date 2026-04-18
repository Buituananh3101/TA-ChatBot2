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


def _build_advanced_query(db: Session, user_id: int, intent: dict):
    """
    Xây dựng query nâng cao dựa trên intent đã parse.
    Hỗ trợ:
      - sort_by: due_date, oldest_review, least_reviewed, most_reviewed, newest, oldest
      - days: câu chưa ôn ít nhất X ngày
      - days_exact: câu ôn chính xác X ngày trước
      - days_min + days_max: câu ôn trong khoảng X-Y ngày trước
      - difficulty: easy, medium, hard
    """
    num = min(intent.get("num", 5), 20)
    sort_by = intent.get("sort_by", "due_date")
    days = intent.get("days", 0)
    days_exact = intent.get("days_exact")
    days_min = intent.get("days_min")
    days_max = intent.get("days_max")
    difficulty = intent.get("difficulty")

    now = datetime.utcnow()

    query = (
        db.query(Question)
        .join(question_set_items, Question.id == question_set_items.c.question_id)
        .filter(Question.user_id == user_id)
    )

    # ── Filter theo difficulty ───────────────────────────────────────────────
    if difficulty and difficulty in ("easy", "medium", "hard"):
        query = query.filter(Question.difficulty == difficulty)

    # ── Filter theo ngày ─────────────────────────────────────────────────────
    if days_exact is not None and isinstance(days_exact, (int, float)) and days_exact >= 0:
        # Chính xác X ngày trước: last_used_at nằm trong ngày đó
        day_start = (now - timedelta(days=int(days_exact))).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        query = query.filter(
            Question.last_used_at >= day_start,
            Question.last_used_at < day_end
        )
    elif days_min is not None and days_max is not None:
        # Khoảng: ôn cách đây từ days_min đến days_max ngày
        # days_min (gần hơn) → cutoff xa hơn trong thời gian
        # days_max (xa hơn) → cutoff gần hơn trong thời gian
        d_min = int(days_min) if isinstance(days_min, (int, float)) else 0
        d_max = int(days_max) if isinstance(days_max, (int, float)) else 0
        if d_min > d_max:
            d_min, d_max = d_max, d_min  # Swap nếu user nói ngược
        range_start = (now - timedelta(days=d_max)).replace(hour=0, minute=0, second=0, microsecond=0)
        range_end = (now - timedelta(days=d_min)).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        query = query.filter(
            Question.last_used_at >= range_start,
            Question.last_used_at < range_end
        )
    elif days > 0:
        # Legacy: câu chưa ôn ít nhất X ngày
        cutoff = now - timedelta(days=days)
        query = query.filter(
            (Question.last_used_at == None) | (Question.last_used_at <= cutoff)
        )
    else:
        # Mặc định: chỉ áp dụng due filter nếu sort_by là due_date
        if sort_by == "due_date":
            yesterday = now - timedelta(days=1)
            query = query.filter(
                (
                    (Question.next_review_at == None) & (
                        (Question.last_used_at == None) | (Question.last_used_at <= yesterday)
                    )
                ) | (Question.next_review_at <= now)
            )

    # ── Sắp xếp (MySQL-compatible, không dùng NULLS FIRST) ─────────────────
    # MySQL mặc định: ASC → NULLs đứng đầu, nên chỉ cần .asc() là đủ.
    if sort_by == "oldest_review":
        # Câu chưa ôn lâu nhất: NULL first (chưa bao giờ ôn), rồi cũ nhất
        query = query.order_by(Question.last_used_at.asc())
    elif sort_by == "least_reviewed":
        # Câu ôn ít lần nhất
        query = query.order_by(Question.review_count.asc())
    elif sort_by == "most_reviewed":
        # Câu ôn nhiều lần nhất
        query = query.order_by(Question.review_count.desc())
    elif sort_by == "newest":
        # Câu mới thêm nhất
        query = query.order_by(Question.created_at.desc())
    elif sort_by == "oldest":
        # Câu cũ nhất
        query = query.order_by(Question.created_at.asc())
    else:
        # due_date (mặc định)
        query = query.order_by(
            Question.next_review_at.asc(),
            Question.last_used_at.asc()
        )

    return query.limit(num).all()


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


def _detect_email(text: str):
    """Detect email trong tin nhắn để liên kết tài khoản."""
    email_match = re.search(r"[\w.\-+]+@[\w\-]+\.[a-z]{2,}", text.lower().strip())
    if email_match:
        return email_match.group(0)
    return None

def _default_intent(**overrides) -> dict:
    """Tạo intent dict với giá trị mặc định, ghi đè bằng overrides."""
    base = {
        "reply": "", "action": "none", "num": 5,
        "sort_by": "due_date", "days": 0,
        "days_exact": None, "days_min": None, "days_max": None,
        "difficulty": None,
    }
    base.update(overrides)
    return base


def _parse_intent_fallback(text: str) -> dict:
    """
    Fallback: phân tích ý định bằng regex khi n8n AI không khả dụng.
    Trả về dict tương thích với response format của n8n AI.
    Hỗ trợ: sort_by, days_exact, days_min/max, difficulty.
    """
    text_lower = text.lower().strip()

    # ── Thống kê ─────────────────────────────────────────────────────────────
    if any(k in text_lower for k in ["thống kê", "bao nhiêu", "còn lại", "tổng", "stat", "tiến trình", "tiến độ"]):
        return _default_intent(action="get_stats")

    # ── Help ──────────────────────────────────────────────────────────────────
    if any(k in text_lower for k in ["help", "hướng dẫn", "giúp", "lệnh", "hỗ trợ", "menu"]):
        return _default_intent(
            reply="📚 Hướng dẫn sử dụng:\n\n"
                  "• 'gửi 5 câu chưa ôn' → Nhận 5 câu cần ôn\n"
                  "• '5 câu chưa ôn lâu nhất' → Câu lâu chưa ôn nhất\n"
                  "• '3 câu ôn ít nhất' → Câu ôn ít lần nhất\n"
                  "• '3 câu ôn nhiều nhất' → Câu ôn nhiều lần nhất\n"
                  "• '3 câu ôn chính xác cách đây 2 ngày'\n"
                  "• '3 câu ôn cách đây từ 5 đến 7 ngày'\n"
                  "• '5 câu khó chưa ôn' → Lọc theo độ khó\n"
                  "• 'mấy câu mới thêm' → Câu vừa thêm gần đây\n"
                  "• 'thống kê' → Xem số câu cần ôn\n"
                  "• 'hướng dẫn' → Hiện menu này",
        )

    # ── Chào hỏi ─────────────────────────────────────────────────────────────
    if any(k in text_lower for k in ["hi", "hello", "xin chào", "chào"]):
        return _default_intent(reply="👋 Chào bạn! Gõ 'hướng dẫn' để xem các lệnh có sẵn nhé!")

    # ── Extract số lượng câu ──────────────────────────────────────────────────
    num_match = re.search(r"(\d+)\s*(?:câu|bài)", text_lower)
    num = int(num_match.group(1)) if num_match else None

    # ── Extract difficulty ───────────────────────────────────────────────────
    difficulty = None
    if any(k in text_lower for k in ["dễ", "easy"]):
        difficulty = "easy"
    elif any(k in text_lower for k in ["khó", "hard"]):
        difficulty = "hard"
    elif any(k in text_lower for k in ["trung bình", "medium", "tb"]):
        difficulty = "medium"

    # ── Pattern: "chưa ôn lâu nhất" / "lâu nhất chưa ôn" ────────────────────
    if re.search(r"(?:chưa\s*ôn\s*lâu|lâu\s*(?:nhất)?\s*chưa\s*ôn|lâu\s*nhất)", text_lower):
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu chưa ôn lâu nhất...",
            action="get_questions", num=n,
            sort_by="oldest_review", difficulty=difficulty,
        )

    # ── Pattern: "ôn ít nhất" / "ít lần nhất" ────────────────────────────────
    if re.search(r"(?:ôn\s*ít|ít\s*(?:lần\s*)?nhất)", text_lower):
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu ôn ít lần nhất...",
            action="get_questions", num=n,
            sort_by="least_reviewed", difficulty=difficulty,
        )

    # ── Pattern: "ôn nhiều nhất" / "nhiều lần nhất" ──────────────────────────
    if re.search(r"(?:ôn\s*nhiều|nhiều\s*(?:lần\s*)?nhất)", text_lower):
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu ôn nhiều lần nhất...",
            action="get_questions", num=n,
            sort_by="most_reviewed", difficulty=difficulty,
        )

    # ── Pattern: "mới thêm" / "mới nhất" / "gần đây" ─────────────────────────
    if re.search(r"(?:mới\s*thêm|mới\s*nhất|gần\s*đây|vừa\s*thêm)", text_lower):
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu mới thêm gần đây...",
            action="get_questions", num=n,
            sort_by="newest", difficulty=difficulty,
        )

    # ── Pattern: "cũ nhất" ───────────────────────────────────────────────────
    if re.search(r"cũ\s*nhất", text_lower):
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu cũ nhất...",
            action="get_questions", num=n,
            sort_by="oldest", difficulty=difficulty,
        )

    # ── Pattern: "chính xác / đúng X ngày" ───────────────────────────────────
    exact_match = re.search(
        r"(?:chính\s*xác|đúng)\s*(?:cách\s*đây\s*)?(\d+)\s*(?:ngày|hôm)", text_lower
    )
    if not exact_match:
        exact_match = re.search(
            r"(\d+)\s*(?:ngày|hôm)\s*(?:trước)?\s*(?:chính\s*xác|đúng)", text_lower
        )
    if exact_match:
        days_exact = int(exact_match.group(1))
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu ôn đúng {days_exact} ngày trước...",
            action="get_questions", num=n,
            days_exact=days_exact, difficulty=difficulty,
        )

    # ── Pattern: "từ X đến Y ngày" / "X-Y ngày" / "trong khoảng X đến Y" ────
    range_match = re.search(
        r"(?:từ|trong\s*khoảng)\s*(\d+)\s*(?:đến|tới|-)\s*(\d+)\s*(?:ngày|hôm)", text_lower
    )
    if not range_match:
        range_match = re.search(
            r"(\d+)\s*(?:đến|tới|-)\s*(\d+)\s*(?:ngày|hôm)", text_lower
        )
    if range_match:
        d1 = int(range_match.group(1))
        d2 = int(range_match.group(2))
        days_min, days_max = min(d1, d2), max(d1, d2)
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu ôn cách đây {days_min}-{days_max} ngày...",
            action="get_questions", num=n,
            days_min=days_min, days_max=days_max, difficulty=difficulty,
        )

    # ── Pattern: Lấy câu hỏi ôn tập (generic) ───────────────────────────────
    q_match = re.search(
        r"(?:g[uử]i|cho\s*(?:tôi|mình)?|lấy|gửi)\s*(\d+)?\s*(?:câu|bài|bài tập)",
        text_lower,
    )
    day_match = re.search(r"(\d+)\s*(?:ngày|hôm)", text_lower)

    if q_match:
        n = int(q_match.group(1)) if q_match.group(1) else 5
        days = int(day_match.group(1)) if day_match else 0
        return _default_intent(
            reply=f"📝 Đang lấy {min(n, 20)} câu cho bạn...",
            action="get_questions", num=min(n, 20),
            days=days, difficulty=difficulty,
        )

    # ── Từ khóa ôn tập ───────────────────────────────────────────────────────
    if any(k in text_lower for k in ["ôn tập", "ôn ngay", "cần ôn", "review", "ôn bài"]):
        days = int(day_match.group(1)) if day_match else 0
        n = min(num or 5, 20)
        return _default_intent(
            reply=f"📝 Đang lấy {n} câu cho bạn...",
            action="get_questions", num=n,
            days=days, difficulty=difficulty,
        )

    # ── Không nhận diện ───────────────────────────────────────────────────────
    return _default_intent(
        reply="🤔 Tôi chưa hiểu yêu cầu đó.\n\nThử gõ: 'gửi 5 câu chưa ôn' hoặc 'hướng dẫn'",
    )


async def _call_n8n_ai_agent(user_id: int, user_name: str, psid: str, message: str) -> dict | None:
    """
    Gọi n8n AI Agent webhook để trích xuất ý định và sinh câu trả lời.
    Trả về None nếu n8n không khả dụng.
    """
    webhook_url = settings.N8N_AI_WEBHOOK_URL
    payload = {"user_id": user_id, "user_name": user_name, "psid": psid, "message": message}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(webhook_url, json=payload)
            logger.info(f"n8n response: status={resp.status_code}, body={resp.text[:500]}")

            if resp.status_code != 200:
                logger.warning(f"n8n AI error: status {resp.status_code}")
                return None

            # Parse JSON response
            try:
                data = resp.json()
            except Exception:
                logger.warning(f"n8n trả về non-JSON: {resp.text[:200]}")
                return None

            return {
                "reply": data.get("reply", data.get("output", "")),
                "action": data.get("action", "none"),
                "num": min(data.get("num", 5), 20),
                "sort_by": data.get("sort_by", "due_date"),
                "days": data.get("days", 0),
                "days_exact": data.get("days_exact"),
                "days_min": data.get("days_min"),
                "days_max": data.get("days_max"),
                "difficulty": data.get("difficulty"),
            }
    except httpx.TimeoutException:
        logger.warning("n8n AI timeout sau 30s")
        return None
    except Exception as e:
        logger.warning(f"n8n AI unavailable: {e}")
        return None


def _split_message(text: str, max_len: int = 2000) -> list[str]:
    """Chia tin nhắn dài thành nhiều phần nhỏ hơn max_len ký tự."""
    if len(text) <= max_len:
        return [text]
    chunks = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break
        split_at = text.rfind("\n", 0, max_len)
        if split_at == -1 or split_at < max_len // 2:
            split_at = text.rfind(" ", 0, max_len)
        if split_at == -1:
            split_at = max_len
        chunks.append(text[:split_at])
        text = text[split_at:].lstrip()
    return chunks


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

            # Bỏ qua echo — tin nhắn do chính bot gửi, Facebook gửi lại webhook
            if message.get("is_echo"):
                continue

            text = message.get("text", "").strip()
            if not text:
                continue

            logger.info(f"Messenger [{sender_psid}]: {text}")

            # Tìm user theo PSID
            user = db.query(User).filter(User.messenger_psid == sender_psid).first()

            # Chưa liên kết tài khoản
            if not user:
                email = _detect_email(text)
                if email:
                    target = db.query(User).filter(User.email == email).first()
                    if not target:
                        await _send_messenger_message(sender_psid, "❌ Không tìm thấy tài khoản với email đó.")
                    elif target.messenger_psid:
                        await _send_messenger_message(sender_psid, "⚠️ Email này đã được liên kết một Messenger khác.")
                    else:
                        target.messenger_psid = sender_psid
                        db.commit()
                        await _send_messenger_message(
                            sender_psid,
                            f"✅ Liên kết thành công! Xin chào {target.name} 👋\n"
                            "Từ giờ bạn có thể chat để nhận bài ôn tập, xem thống kê..."
                        )
                else:
                    await _send_messenger_message(
                        sender_psid, "👋 Xin chào! Hãy gõ địa chỉ EMAIL bạn dùng trên web để liên kết tài khoản:"
                    )
                continue

            # Check email (nếu gõ lúc đã liên kết)
            email = _detect_email(text)
            if email:
                await _send_messenger_message(sender_psid, f"ℹ️ Tài khoản của bạn đã được liên kết với tên {user.name}.")
                continue

            # Gọi n8n AI Agent
            ai_resp = await _call_n8n_ai_agent(user.id, user.name, sender_psid, text)
            if ai_resp is None:
                await _send_messenger_message(
                    sender_psid,
                    "⚠️ Hệ thống AI đang bận, vui lòng thử lại sau."
                )
                continue

            # Gửi text reply trước
            reply = ai_resp.get("reply", "")
            if reply:
                for chunk in _split_message(reply):
                    await _send_messenger_message(sender_psid, chunk)

            # Chạy DB action sau
            action = ai_resp.get("action", "none")
            if action == "get_questions":
                await _handle_get_questions(sender_psid, user.id, ai_resp, db)
            elif action == "get_stats":
                await _handle_get_stats(sender_psid, user.id, user.name, db)

    return {"status": "ok"}


async def _handle_get_questions(
    psid: str, user_id: int, intent: dict, db: Session
):
    """Lấy câu hỏi cần ôn và gửi về Messenger (hỗ trợ advanced query)."""
    questions = _build_advanced_query(db, user_id, intent)
    days = intent.get("days", 0)

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
