import re
import math
from PyPDF2 import PdfReader
import requests
from bs4 import BeautifulSoup
from youtube_transcript_api import YouTubeTranscriptApi

def _clean_text(text: str) -> str:
    """Loại bỏ khoảng trắng thừa"""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def process_pdf(file_path: str) -> str:
    """Đọc text từ file PDF"""
    try:
        reader = PdfReader(file_path)
        full_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                full_text.append(f"--- Trang {i + 1} ---\n{text}")
        return "\n\n".join(full_text)
    except Exception as e:
        raise Exception(f"Lỗi khi đọc PDF: {e}")

def process_web_url(url: str) -> str:
    """Tải text từ web page"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")
        
        # Xóa script, style, header, footer để giảm nhiễu
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        
        text = soup.get_text(separator="\n")
        return _clean_text(text)
    except Exception as e:
        raise Exception(f"Lỗi khi đọc website: {e}")

def get_youtube_id(url: str) -> str:
    """Trích xuất ID video từ URL YouTube"""
    pattern = r'(?:v=|\/)([0-9A-Za-z_-]{11}).*'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return None

def process_youtube_url(url: str) -> str:
    """Lấy transcript từ YouTube video"""
    video_id = get_youtube_id(url)
    if not video_id:
        raise Exception("Không tìm thấy YouTube ID hợp lệ.")
    
    try:
        # Cố gắng lấy tiếng Việt hoặc tiếng Anh
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['vi', 'en'])
        text = " ".join([t['text'] for t in transcript])
        return _clean_text(text)
    except Exception as e:
        raise Exception(f"Lỗi khi lấy phụ đề YouTube (video có thể không có phụ đề): {e}")

def chunk_text(text: str, chunk_size: int = 2000, overlap: int = 200) -> list[str]:
    """Cắt text thành các khối nhỏ (ước tính theo lượng text length).
    Note: Token size thường tốn ~4 ký tự = 1 token. 
    chunk_size=2000 chars ~ 500 tokens. overlap=200 chars ~ 50 tokens."""
    if not text:
        return []
        
    chunks = []
    text_len = len(text)
    
    # Đơn giản hoá: cắt chuỗi the char length với overlap
    step = chunk_size - overlap
    if step <= 0:
        step = chunk_size
        
    for i in range(0, text_len, step):
        chunks.append(text[i:i + chunk_size])
        
    return chunks

from app.chroma_client import notebook_chunks_collection

def embed_notebook_chunks(notebook_id: int, source_id: int, chunks: list[str]):
    """Đưa các chunks vào ChromaDB"""
    if not chunks:
        return
        
    ids = [f"n_{notebook_id}_s_{source_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "notebook_id": notebook_id,
            "source_id": source_id,
            "chunk_index": i
        } for i in range(len(chunks))
    ]
    
    notebook_chunks_collection.add(
        ids=ids,
        documents=chunks,
        metadatas=metadatas
    )

def search_notebook_chunks(notebook_id: int, query: str, n: int = 5, active_source_ids: list[int] = None) -> list[dict]:
    """Tìm các chunks liên quan đến câu hỏi trong notebook"""
    where_clause = {"notebook_id": notebook_id}
    
    if active_source_ids is not None:
        if len(active_source_ids) == 0:
            return [] # Trả về rỗng nếu người dùng không chọn source nào
        elif len(active_source_ids) == 1:
            where_clause = {"$and": [{"notebook_id": notebook_id}, {"source_id": active_source_ids[0]}]}
        else:
            where_clause = {"$and": [{"notebook_id": notebook_id}, {"source_id": {"$in": active_source_ids}}]}

    results = notebook_chunks_collection.query(
        query_texts=[query],
        n_results=n,
        where=where_clause
    )
    
    if not results or not results["documents"] or not results["documents"][0]:
        return []
        
    docs = results["documents"][0]
    metas = results["metadatas"][0] if results["metadatas"] else []
    
    chunks = []
    for i, doc in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        chunks.append({
            "text": doc,
            "source_id": meta.get("source_id"),
            "chunk_index": meta.get("chunk_index")
        })
        
    return chunks
