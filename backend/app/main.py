import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import engine, Base
from app import models  # noqa: F401 — import để Base nhận diện tất cả models
from app.routers import auth, chat, upload, problems, review, library, stats, n8n_webhook, notebook

Base.metadata.create_all(bind=engine)

# Auto migrate chat_sessions notebook_id
try:
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN notebook_id INTEGER DEFAULT NULL;"))
        conn.execute(text("ALTER TABLE chat_sessions ADD CONSTRAINT fk_chat_session_notebook FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL;"))
        conn.commit()
except Exception:
    pass  # Already exists or no connection
app = FastAPI(title="Math Chatbot API", version="1.0.0")

# Static files: ảnh đề gốc người dùng upload
STATIC_DIR = Path(__file__).parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
import logging

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logging.error(f"Dòng lỗi cực kỳ quan trọng ở đây: {e}")
        raise e

app.include_router(auth.router,       prefix="/api/auth")
app.include_router(chat.router,       prefix="/api/chat")
app.include_router(upload.router,     prefix="/api/upload")
app.include_router(problems.router,   prefix="/api/problems")
app.include_router(review.router,     prefix="/api/review")
app.include_router(library.router,    prefix="/api/library")
app.include_router(stats.router,      prefix="/api/stats")
app.include_router(n8n_webhook.router, prefix="/api/n8n")
app.include_router(notebook.router,   prefix="/api/notebook")

@app.get("/")
def root():
    return {"status": "ok", "message": "Math Chatbot API đang chạy"}