from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    email      = Column(String(150), unique=True, nullable=False, index=True)
    password   = Column(String(255), nullable=False)
    grade      = Column(Integer, default=10)
    created_at = Column(DateTime, server_default=func.now())

    sessions     = relationship("ChatSession", back_populates="user")
    questions    = relationship("Question", back_populates="user")
    source_exams = relationship("SourceExam", back_populates="user")  # FIX: thêm dòng này