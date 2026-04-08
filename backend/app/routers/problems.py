from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.schemas.problem import SourceExamOut, SourceExamUpdate, QuestionUpdate, QuestionOut
from app.models.problem import SourceExam, Question
from app.services.embed_service import update_question_metadata

router = APIRouter(tags=["Problems"])

@router.get("/exams", response_model=list[SourceExamOut])
def list_exams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (db.query(SourceExam)
              .filter(SourceExam.user_id == user.id)
              .order_by(SourceExam.uploaded_at.desc())
              .all())

@router.get("/exams/{exam_id}", response_model=SourceExamOut)
def get_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    exam = db.query(SourceExam).filter(SourceExam.id == exam_id, SourceExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")
    return exam

@router.delete("/exams/{exam_id}", status_code=200)
def delete_exam(exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    from app.services.embed_service import delete_question
    from app.models.exam import review_exam_questions

    exam = db.query(SourceExam).filter(
        SourceExam.id == exam_id,
        SourceExam.user_id == user.id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")

    # Liệt kê danh sách ID câu hỏi
    question_ids = [q.id for q in exam.questions]
    
    # 1. Xoá liên kết Many-to-Many với các đề ôn tập để tránh lỗi Foreign Key Constraint
    if question_ids:
        db.execute(review_exam_questions.delete().where(review_exam_questions.c.question_id.in_(question_ids)))

    # 2. Xoá khỏi ChromaDB
    for qid in question_ids:
        try:
            delete_question(qid)
        except Exception:
            pass  # Bỏ qua nếu câu hỏi không tồn tại trong Chroma

    # 3. Xoá exam khỏi DB (cascade sẽ tự xoá các Question con)
    db.delete(exam)
    db.commit()
    return {"message": "Đã xoá thành công"}

@router.put("/exams/{exam_id}", response_model=SourceExamOut)
def update_exam(exam_id: int, data: SourceExamUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    exam = db.query(SourceExam).filter(SourceExam.id == exam_id, SourceExam.user_id == user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề")
    
    exam.title = data.title
    db.commit()
    db.refresh(exam)
    return exam

@router.put("/questions/{question_id}", response_model=QuestionOut)
def update_question(question_id: int, data: QuestionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    question = db.query(Question).filter(Question.id == question_id, Question.user_id == user.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    
    question.topic = data.topic
    question.difficulty = data.difficulty
    db.commit()
    db.refresh(question)
    
    # Cập nhật ChromaDB
    try:
        update_question_metadata(question)
    except Exception as e:
        # Log error if needed, but don't fail the request
        print(f"Error updating chromadb for question {question.id}: {e}")
        
    return question

