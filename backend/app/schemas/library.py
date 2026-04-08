from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.schemas.problem import QuestionOut


class FolderCreate(BaseModel):
    name: str

class FolderRename(BaseModel):
    name: str

class FolderOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    question_sets: List["QuestionSetOut"] = []

    class Config:
        from_attributes = True


class QuestionSetCreate(BaseModel):
    name: str

class QuestionSetRename(BaseModel):
    name: str

class QuestionSetOut(BaseModel):
    id: int
    folder_id: int
    name: str
    created_at: datetime
    questions: List[QuestionOut] = []

    class Config:
        from_attributes = True


class AddQuestionRequest(BaseModel):
    question_id: int


# Forward-ref update
FolderOut.model_rebuild()
