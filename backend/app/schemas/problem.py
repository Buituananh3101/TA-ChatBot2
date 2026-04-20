from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class QuestionOut(BaseModel):
    id: int
    content: str
    topic: Optional[str]
    difficulty: str
    has_image: bool = False
    source_image_url: Optional[str] = None
    question_type: str = "multiple_choice"
    created_at: datetime
    last_used_at: Optional[datetime] = None
    review_count: int = 0
    source_exam_id: int
    # Spaced repetition
    next_review_at: Optional[datetime] = None
    interval_days: int = 1
    ease_factor: float = 2.5

    answer_blocks: Optional[list] = None

    class Config:
        from_attributes = True

class AnswerBlocksUpdate(BaseModel):
    blocks: list



class SourceExamOut(BaseModel):
    id: int
    title: Optional[str]
    image_url: Optional[str]
    uploaded_at: datetime
    questions: List[QuestionOut] = []

    class Config:
        from_attributes = True


class ReviewRequest(BaseModel):
    topics: List[str]
    num_questions: int = 10


class ReviewExamOut(BaseModel):
    id: int
    title: Optional[str]
    created_at: datetime
    questions: List[QuestionOut] = []

    class Config:
        from_attributes = True


class SourceExamUpdate(BaseModel):
    title: str


class QuestionUpdate(BaseModel):
    topic: str
    difficulty: str


class MarkReviewedRequest(BaseModel):
    """Body cho POST /questions/{id}/mark-reviewed"""
    quality: int = 3   # 0–5, mặc định 3 (nhớ được)