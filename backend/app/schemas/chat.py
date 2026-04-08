from pydantic import BaseModel
from datetime import datetime
from typing import List

class ChatMessage(BaseModel):
    message: str

class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

class ChatSessionOut(BaseModel):
    id: int
    created_at: datetime
    messages: List[MessageOut] = []

    class Config:
        from_attributes = True
