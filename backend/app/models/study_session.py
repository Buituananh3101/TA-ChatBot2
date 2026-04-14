from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class StudySession(Base):
    __tablename__ = "study_sessions"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at       = Column(DateTime, server_default=func.now())
    ended_at         = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    page             = Column(String(50), nullable=True)