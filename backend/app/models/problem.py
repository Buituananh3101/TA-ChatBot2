from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class SourceExam(Base):
    __tablename__ = "source_exams"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    title       = Column(String(200))
    image_url   = Column(Text)
    uploaded_at = Column(DateTime, server_default=func.now())

    questions   = relationship("Question", back_populates="source_exam", cascade="all, delete-orphan")

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
    last_used_at   = Column(DateTime, nullable=True)
    review_count   = Column(Integer, default=0, nullable=False)
    created_at     = Column(DateTime, server_default=func.now())

    source_exam = relationship("SourceExam", back_populates="questions")
    user        = relationship("User", back_populates="questions")

    @property
    def source_image_url(self) -> str | None:
        """Trả về image_url của đề gốc, dùng để hiển thị ảnh trong ReviewPage."""
        return self.source_exam.image_url if self.source_exam else None
