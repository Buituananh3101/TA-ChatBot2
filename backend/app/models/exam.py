from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

review_exam_questions = Table(
    "review_exam_questions",
    Base.metadata,
    Column("review_exam_id", Integer, ForeignKey("review_exams.id"), primary_key=True),
    Column("question_id",    Integer, ForeignKey("questions.id"),     primary_key=True),
    Column("order_num",      Integer),
)

class ReviewExam(Base):
    __tablename__ = "review_exams"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    title      = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())

    questions  = relationship("Question", secondary=review_exam_questions)
