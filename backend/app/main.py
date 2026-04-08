from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import engine, Base
from app import models  # noqa: F401 — import để Base nhận diện tất cả models
from app.routers import auth, chat, upload, problems, review, library

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Math Chatbot API", version="1.0.0")

# Static files: ảnh đề gốc người dùng upload
STATIC_DIR = Path(__file__).parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth")
app.include_router(chat.router,     prefix="/api/chat")
app.include_router(upload.router,   prefix="/api/upload")
app.include_router(problems.router, prefix="/api/problems")
app.include_router(review.router,   prefix="/api/review")
app.include_router(library.router,  prefix="/api/library")

@app.get("/")
def root():
    return {"status": "ok", "message": "Math Chatbot API đang chạy"}
