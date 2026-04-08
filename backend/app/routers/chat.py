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
async def send_message(session_id: int, body: ChatMessage, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    # Lưu tin nhắn user
    user_msg = Message(session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    db.commit()

    # Lấy lịch sử hội thoại (tối đa 20 tin nhắn gần nhất)
    history = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc()).limit(20).all()
    history_data = [{"role": m.role, "content": m.content} for m in history[:-1]]

    # Gọi LLM
    reply = await llm_chat(history_data, body.message)

    # Lưu tin nhắn bot
    bot_msg = Message(session_id=session_id, role="assistant", content=reply)
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)
    return bot_msg
