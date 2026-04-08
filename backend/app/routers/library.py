from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models.user import User
from app.models.library import Folder, QuestionSet, question_set_items
from app.models.problem import Question
from app.schemas.library import (
    FolderCreate, FolderRename, FolderOut,
    QuestionSetCreate, QuestionSetRename, QuestionSetOut,
    AddQuestionRequest,
)
from app.schemas.problem import QuestionOut
from app.services.auth_service import get_current_user

router = APIRouter(tags=["Library"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_folder(folder_id: int, user_id: int, db: Session) -> Folder:
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Không tìm thấy folder")
    return folder

def _get_set(set_id: int, user_id: int, db: Session) -> QuestionSet:
    qs = db.query(QuestionSet).filter(QuestionSet.id == set_id, QuestionSet.user_id == user_id).first()
    if not qs:
        raise HTTPException(status_code=404, detail="Không tìm thấy tập câu hỏi")
    return qs


# ── Folder CRUD ────────────────────────────────────────────────────────────────

@router.get("/folders", response_model=list[FolderOut])
def list_folders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lấy toàn bộ folder của user (kèm question_sets và câu hỏi)."""
    return (
        db.query(Folder)
        .filter(Folder.user_id == user.id)
        .order_by(Folder.created_at.asc())
        .all()
    )

@router.post("/folders", response_model=FolderOut, status_code=201)
def create_folder(
    body: FolderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = Folder(user_id=user.id, name=body.name.strip())
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

@router.patch("/folders/{folder_id}", response_model=FolderOut)
def rename_folder(
    folder_id: int,
    body: FolderRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = _get_folder(folder_id, user.id, db)
    folder.name = body.name.strip()
    db.commit()
    db.refresh(folder)
    return folder

@router.delete("/folders/{folder_id}", status_code=200)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = _get_folder(folder_id, user.id, db)
    db.delete(folder)
    db.commit()
    return {"message": "Đã xoá folder"}


# ── QuestionSet CRUD ───────────────────────────────────────────────────────────

@router.get("/folders/{folder_id}/sets", response_model=list[QuestionSetOut])
def list_sets(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_folder(folder_id, user.id, db)
    return (
        db.query(QuestionSet)
        .filter(QuestionSet.folder_id == folder_id, QuestionSet.user_id == user.id)
        .order_by(QuestionSet.created_at.asc())
        .all()
    )

@router.post("/folders/{folder_id}/sets", response_model=QuestionSetOut, status_code=201)
def create_set(
    folder_id: int,
    body: QuestionSetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_folder(folder_id, user.id, db)
    qs = QuestionSet(user_id=user.id, folder_id=folder_id, name=body.name.strip())
    db.add(qs)
    db.commit()
    db.refresh(qs)
    return qs

@router.patch("/sets/{set_id}", response_model=QuestionSetOut)
def rename_set(
    set_id: int,
    body: QuestionSetRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    qs = _get_set(set_id, user.id, db)
    qs.name = body.name.strip()
    db.commit()
    db.refresh(qs)
    return qs

@router.delete("/sets/{set_id}", status_code=200)
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    qs = _get_set(set_id, user.id, db)
    db.delete(qs)
    db.commit()
    return {"message": "Đã xoá tập câu hỏi"}


# ── Questions trong QuestionSet ────────────────────────────────────────────────

@router.get("/sets/{set_id}/questions", response_model=list[QuestionOut])
def list_set_questions(
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    qs = _get_set(set_id, user.id, db)
    return qs.questions

@router.post("/sets/{set_id}/questions", status_code=201)
def add_question_to_set(
    set_id: int,
    body: AddQuestionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    qs = _get_set(set_id, user.id, db)

    # Kiểm tra câu hỏi thuộc user
    question = db.query(Question).filter(
        Question.id == body.question_id,
        Question.user_id == user.id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")

    # Kiểm tra câu hỏi đã nằm trong 1 set nào chưa
    existing = db.execute(
        question_set_items.select().where(question_set_items.c.question_id == body.question_id)
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Câu hỏi này đã nằm trong một tập câu hỏi khác",
        )

    db.execute(question_set_items.insert().values(
        question_set_id=set_id,
        question_id=body.question_id,
    ))
    db.commit()
    return {"message": "Đã thêm câu hỏi vào tập"}

@router.delete("/sets/{set_id}/questions/{question_id}", status_code=200)
def remove_question_from_set(
    set_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_set(set_id, user.id, db)
    result = db.execute(
        question_set_items.delete().where(
            question_set_items.c.question_set_id == set_id,
            question_set_items.c.question_id == question_id,
        )
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Câu hỏi không có trong tập này")
    return {"message": "Đã xoá câu hỏi khỏi tập"}
