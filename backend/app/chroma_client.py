import chromadb
from app.config import settings

client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
#client = chromadb.Client()

# Collection lưu toàn bộ câu hỏi dưới dạng vector
questions_collection = client.get_or_create_collection(
    name="questions",
    metadata={"hnsw:space": "cosine"}
)

# Collection lưu các đoạn văn bản (chunks) từ tài liệu notebook
notebook_chunks_collection = client.get_or_create_collection(
    name="notebook_chunks",
    metadata={"hnsw:space": "cosine"}
)
