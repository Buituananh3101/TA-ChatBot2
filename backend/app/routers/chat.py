from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, Message
from app.schemas.chat import ChatMessage, ChatSessionOut, MessageOut
from app.services.auth_service import get_current_user
from app.services.llm_service import chat as llm_chat

router = APIRouter(tags=["Chat"])

@router.post("/sessions", response_model=ChatSessionOut)
def create_session(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = ChatSession(user_id=user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(ChatSession).filter(ChatSession.user_id == user.id).order_by(ChatSession.created_at.desc()).all()

@router.get("/sessions/{session_id}", response_model=ChatSessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return session

@router.post("/sessions/{session_id}/messages", response_model=MessageOut)
async def send_message(
    session_id: int,
    body: ChatMessage,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    # Lưu tin nhắn user
    user_msg = Message(session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    db.commit()

    # Lấy lịch sử (tối đa 20 tin nhắn gần nhất, bỏ tin vừa lưu)
    history = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(20)
        .all()
    )
    history_data = [{"role": m.role, "content": m.content} for m in history[:-1]]

    # Gọi LLM — FIX: phân loại lỗi rõ ràng thay vì nuốt im lặng
    try:
        reply = await llm_chat(history_data, body.message)
    except Exception as e:
        error_str = str(e)
        import logging
        logging.getLogger(__name__).error(f"LLM ERROR: {type(e).__name__}: {error_str[:300]}")

        # Phân loại lỗi để hiển thị thông báo phù hợp cho user
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            if "PerDay" in error_str or "limit: 0" in error_str:
                reply = "⚠️ Hệ thống AI đã hết hạn mức sử dụng hôm nay. Vui lòng thử lại vào ngày mai."
            else:
                reply = "⚠️ Hệ thống AI đang quá tải, vui lòng thử lại sau 1 phút."
        elif "503" in error_str or "UNAVAILABLE" in error_str:
            reply = "⚠️ Dịch vụ AI tạm thời không khả dụng, vui lòng thử lại sau."
        else:
            reply = "⚠️ Có lỗi xảy ra khi kết nối AI, vui lòng thử lại."

    # Lưu tin nhắn bot
    bot_msg = Message(session_id=session_id, role="assistant", content=reply)
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)
    return bot_msg