from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# ── Association table: QuestionSet ↔ Question ─────────────────────────────────
# UNIQUE(question_id) đảm bảo mỗi câu hỏi chỉ thuộc tối đa 1 QuestionSet
question_set_items = Table(
    "question_set_items",
    Base.metadata,
    Column("question_set_id", Integer, ForeignKey("question_sets.id", ondelete="CASCADE"), nullable=False),
    Column("question_id",     Integer, ForeignKey("questions.id",     ondelete="CASCADE"), nullable=False),
    UniqueConstraint("question_id", name="uq_question_set_items_question"),
)

# ── Folder ─────────────────────────────────────────────────────────────────────
class Folder(Base):
    __tablename__ = "folders"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(200), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    question_sets = relationship(
        "QuestionSet",
        back_populates="folder",
        cascade="all, delete-orphan",
    )

# ── QuestionSet ────────────────────────────────────────────────────────────────
class QuestionSet(Base):
    __tablename__ = "question_sets"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    folder_id  = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(200), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    folder    = relationship("Folder", back_populates="question_sets")
    questions = relationship(
        "Question",
        secondary=question_set_items,
        lazy="select",
    )
