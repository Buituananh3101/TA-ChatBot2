from app.chroma_client import questions_collection
from app.models.problem import Question

async def add_question(question: Question):
    """Embed một câu hỏi vào ChromaDB sau khi đã lưu vào MySQL"""
    questions_collection.add(
        ids=[f"q_{question.id}"],
        documents=[question.content],
        metadatas=[{
            "user_id":        question.user_id,
            "source_exam_id": question.source_exam_id,
            "question_id":    question.id,
            "topic":          question.topic or "Khác",
            "difficulty":     question.difficulty or "medium",
        }]
    )

def delete_question(question_id: int):
    questions_collection.delete(ids=[f"q_{question_id}"])

def update_question_metadata(question: Question):
    """Cập nhật metadata của câu hỏi trong ChromaDB"""
    questions_collection.update(
        ids=[f"q_{question.id}"],
        metadatas=[{
            "user_id":        question.user_id,
            "source_exam_id": question.source_exam_id,
            "question_id":    question.id,
            "topic":          question.topic or "Khác",
            "difficulty":     question.difficulty or "medium",
        }]
    )

def search_questions(user_id: int, topic: str, n: int = 20) -> list[int]:
    """Trả về list question_id phù hợp từ Chroma"""
    results = questions_collection.query(
        query_texts=[f"bài tập {topic}"],
        n_results=n,
        where={"$and": [{"user_id": user_id}, {"topic": topic}]}
    )
    ids = results["ids"][0] if results["ids"] else []
    return [int(i.replace("q_", "")) for i in ids]
