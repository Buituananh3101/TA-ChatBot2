import chromadb
from app.config import settings

client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)

# Collection lưu toàn bộ câu hỏi dưới dạng vector
questions_collection = client.get_or_create_collection(
    name="questions",
    metadata={"hnsw:space": "cosine"}
)
