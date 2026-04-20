from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from sqlalchemy.dialects.mysql import JSON

class Notebook(Base):
    __tablename__ = "notebooks"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    title      = Column(String(200), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user              = relationship("User", backref="notebooks")
    sources           = relationship("NotebookSource", back_populates="notebook", cascade="all, delete-orphan")
    chat_sessions     = relationship("ChatSession", back_populates="notebook")
    mindmaps          = relationship("NotebookMindmap", back_populates="notebook", cascade="all, delete-orphan")


class NotebookSource(Base):
    __tablename__ = "notebook_sources"

    id           = Column(Integer, primary_key=True, index=True)
    notebook_id  = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    source_type  = Column(Enum("pdf", "web", "youtube"), nullable=False)
    title        = Column(String(255), nullable=False)
    url          = Column(String(1000), nullable=True)     # For web/youtube
    file_path    = Column(String(500), nullable=True)      # For pdf
    chunk_count  = Column(Integer, default=0)
    created_at   = Column(DateTime, server_default=func.now())

    notebook = relationship("Notebook", back_populates="sources")


class NotebookMindmap(Base):
    __tablename__ = "notebook_mindmaps"

    id          = Column(Integer, primary_key=True, index=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    title       = Column(String(200), nullable=False)
    data_json   = Column(JSON, nullable=False) # Store ReactFlow nodes & edges
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

    notebook = relationship("Notebook", back_populates="mindmaps")
