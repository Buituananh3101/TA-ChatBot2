from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from datetime import datetime

class SourceExam(Base):
    __tablename__ = "source_exams"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(255))
    image_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Alias để tương thích với schema SourceExamOut dùng uploaded_at
    @property
    def uploaded_at(self):
        return self.created_at

    # Relationships
    user = relationship("User", back_populates="source_exams")
    questions = relationship("Question", back_populates="source_exam", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"

    id             = Column(Integer, primary_key=True, index=True)
    source_exam_id = Column(Integer, ForeignKey("source_exams.id"), nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    content        = Column(Text, nullable=False)
    topic          = Column(String(100))
    difficulty     = Column(Enum("easy", "medium", "hard"), default="medium")
    has_image      = Column(Boolean, default=False)
    chroma_id      = Column(String(100))
    question_type  = Column(String(20), default='multiple_choice')

    # Spaced repetition fields
    last_used_at   = Column(DateTime, nullable=True)
    review_count   = Column(Integer, default=0, nullable=False)
    next_review_at = Column(DateTime, nullable=True)
    interval_days  = Column(Integer, default=1)
    ease_factor    = Column(Float, default=2.5)

    answer_blocks  = Column(JSON, nullable=True)  # Store answer blocks

    created_at     = Column(DateTime, server_default=func.now())

    source_exam = relationship("SourceExam", back_populates="questions")
    user        = relationship("User", back_populates="questions")

    @property
    def source_image_url(self) -> str | None:
        return self.source_exam.image_url if self.source_exam else None