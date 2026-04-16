from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class NotificationLog(Base):
    """Lưu lịch sử gửi thông báo qua Messenger/Email/Telegram."""
    __tablename__ = "notification_logs"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    channel         = Column(String(20), default="messenger")   # messenger / email / telegram
    status          = Column(String(20), nullable=False)         # sent / failed / skipped
    message_preview = Column(Text, default="")
    error_detail    = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
