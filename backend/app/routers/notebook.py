import os
import shutil
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.notebook import Notebook, NotebookSource, NotebookMindmap
from app.models.chat import ChatSession, Message
from app.services.auth_service import get_current_user
from app.services.document_service import process_pdf, process_web_url, process_youtube_url, chunk_text, embed_notebook_chunks, search_notebook_chunks
from app.services.llm_service import grounded_chat, client
from pydantic import BaseModel
from typing import List
from app.chroma_client import notebook_chunks_collection

router = APIRouter(tags=["Notebook"])

class NotebookCreate(BaseModel):
    title: str

class NotebookUpdate(BaseModel):
    title: str

class UrlSource(BaseModel):
    url: str

class ChatMessage(BaseModel):
    message: str
    active_sources: list[int] = None

# ── Notebook CRUD ─────────────────────────────────────────────────────────────

@router.get("/")
def list_notebooks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    notebooks = db.query(Notebook).filter(Notebook.user_id == user.id).order_by(Notebook.created_at.desc()).all()
    # Serialize manually or rely on mapping
    res = []
    for nb in notebooks:
        res.append({
            "id": nb.id,
            "title": nb.title,
            "created_at": nb.created_at,
            "sources": [{"id": s.id, "title": s.title, "source_type": s.source_type, "chunk_count": s.chunk_count} for s in nb.sources]
        })
    return res

@router.post("/")
def create_notebook(data: NotebookCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = Notebook(user_id=user.id, title=data.title)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    # Tự động tạo 1 chat session cho notebook này
    chat_ss = ChatSession(user_id=user.id, notebook_id=nb.id)
    db.add(chat_ss)
    db.commit()
    return {"id": nb.id, "title": nb.title, "sources": []}

@router.get("/{nb_id}")
def get_notebook(nb_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    
    return {
        "id": nb.id,
        "title": nb.title,
        "created_at": nb.created_at,
        "sources": [{"id": s.id, "title": s.title, "source_type": s.source_type, "url": s.url, "chunk_count": s.chunk_count} for s in nb.sources],
        "mindmaps": [{"id": m.id, "title": m.title, "data": m.data_json} for m in nb.mindmaps]
    }

@router.patch("/{nb_id}")
def rename_notebook(nb_id: int, data: NotebookUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    nb.title = data.title
    db.commit()
    return {"id": nb.id, "title": nb.title}

@router.delete("/{nb_id}")
def delete_notebook(nb_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    
    # Xoá chunks trong ChromaDB
    try:
        notebook_chunks_collection.delete(where={"notebook_id": nb_id})
    except Exception as e:
        print(f"Lỗi xoá chroma chunks: {e}")
        
    db.delete(nb)
    db.commit()
    return {"success": True}

# ── Sources ───────────────────────────────────────────────────────────────────

@router.post("/{nb_id}/sources/pdf")
async def add_pdf_source(nb_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
        
    if len(nb.sources) >= 15:
        raise HTTPException(400, "Tối đa 15 tài liệu mỗi notebook")
        
    # Lưu file tạm
    tmp_path = os.path.join(tempfile.gettempdir(), file.filename)
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    try:
        text = process_pdf(tmp_path)
    except Exception as e:
        raise HTTPException(400, str(e))
    finally:
        os.remove(tmp_path)
        
    chunks = chunk_text(text)
    
    src = NotebookSource(notebook_id=nb_id, source_type="pdf", title=file.filename, chunk_count=len(chunks))
    db.add(src)
    db.commit()
    db.refresh(src)
    
    embed_notebook_chunks(nb_id, src.id, chunks)
    return {"id": src.id, "title": src.title, "source_type": src.source_type, "chunk_count": src.chunk_count}

@router.post("/{nb_id}/sources/url")
async def add_url_source(nb_id: int, body: UrlSource, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
        
    if len(nb.sources) >= 15:
        raise HTTPException(400, "Tối đa 15 tài liệu mỗi notebook")

    url = body.url
    is_youtube = "youtube.com" in url or "youtu.be" in url
    source_type = "youtube" if is_youtube else "web"
    
    try:
        if is_youtube:
            text = process_youtube_url(url)
        else:
            text = process_web_url(url)
    except Exception as e:
        raise HTTPException(400, str(e))
        
    chunks = chunk_text(text)
    
    title = url[:50] + "..." if len(url) > 50 else url
    if is_youtube:
        title = f"YouTube: {title}"
        
    src = NotebookSource(notebook_id=nb_id, source_type=source_type, title=title, url=url, chunk_count=len(chunks))
    db.add(src)
    db.commit()
    db.refresh(src)
    
    embed_notebook_chunks(nb_id, src.id, chunks)
    return {"id": src.id, "title": src.title, "source_type": src.source_type, "chunk_count": src.chunk_count}

@router.delete("/{nb_id}/sources/{src_id}")
def delete_source(nb_id: int, src_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    src = db.query(NotebookSource).join(Notebook).filter(NotebookSource.id == src_id, Notebook.user_id == user.id).first()
    if not src:
        raise HTTPException(404, "Source not found")
        
    try:
        notebook_chunks_collection.delete(where={"$and": [{"notebook_id": nb_id}, {"source_id": src_id}]})
    except:
        pass
        
    db.delete(src)
    db.commit()
    return {"success": True}

# ── Chat ──────────────────────────────────────────────────────────────────────

@router.get("/{nb_id}/messages")
def get_messages(nb_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Tìm chat session của notebook
    chat_ss = db.query(ChatSession).filter(ChatSession.notebook_id == nb_id).first()
    if not chat_ss:
        return []
        
    msgs = db.query(Message).filter(Message.session_id == chat_ss.id).order_by(Message.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in msgs]

@router.post("/{nb_id}/chat")
async def send_chat(nb_id: int, body: ChatMessage, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
        
    chat_ss = db.query(ChatSession).filter(ChatSession.notebook_id == nb_id).first()
    if not chat_ss:
        chat_ss = ChatSession(user_id=user.id, notebook_id=nb_id)
        db.add(chat_ss)
        db.commit()
        db.refresh(chat_ss)
        
    user_msg = Message(session_id=chat_ss.id, role="user", content=body.message)
    db.add(user_msg)
    db.commit()
    
    history = db.query(Message).filter(Message.session_id == chat_ss.id).order_by(Message.created_at.asc()).limit(20).all()
    history_data = [{"role": m.role, "content": m.content} for m in history[:-1]]
    
    # RAG search
    context_chunks = search_notebook_chunks(nb_id, body.message, n=5, active_source_ids=body.active_sources)
    
    try:
        if len(context_chunks) > 0:
            reply = await grounded_chat(history_data, body.message, context_chunks)
        else:
            # Fallback chat nếu ko có source
            from app.services.llm_service import chat as fallback_chat
            reply = await fallback_chat(history_data, body.message)
    except Exception as e:
        reply = f"⚠️ Lỗi kết nối AI: {e}"

    bot_msg = Message(session_id=chat_ss.id, role="assistant", content=reply)
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)
    
    return {"id": bot_msg.id, "role": bot_msg.role, "content": bot_msg.content, "created_at": bot_msg.created_at}

# ── Mindmap ───────────────────────────────────────────────────────────────────

class MindmapCreate(BaseModel):
    title: str

@router.post("/{nb_id}/mindmaps/generate")
async def generate_mindmap(nb_id: int, body: MindmapCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.services.llm_service import client
    from google.genai import types
    import json
    
    nb = db.query(Notebook).filter(Notebook.id == nb_id, Notebook.user_id == user.id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
        
    sources = nb.sources
    if not sources:
        raise HTTPException(400, "Vui lòng thêm tài liệu vào Notebook trước khi tạo Mindmap")
        
    # Gom text từ DB chunk (Lấy khoảng top 20 chunks lớn nhất liên quan topic hoặc simply limit lấy random/top để tránh lố token)
    # Đơn giản, ta query Chroma với text "tổng hợp kiến thức quan trọng"
    context_chunks = search_notebook_chunks(nb_id, "tổng hợp kiến thức trọng tâm", n=15)
    context_text = "\n\n".join([c["text"] for c in context_chunks])
    
    prompt = f"""Dựa trên tài liệu dưới đây, hãy tạo một Mindmap hệ thống hóa kiến thức trọng tâm.
ĐỊNH DẠNG ĐẦU RA PHẢI LÀ JSON hợp lệ tuân theo cấu trúc sau:
{{
  "label": "Chủ đề chính",
  "children": [
     {{ "label": "Nhánh 1", "children": [ {{"label": "Con 1.1"}} ] }},
     {{ "label": "Nhánh 2" }}
  ]
}}
Tuyệt đối KHÔNG trả về markdown, KHÔNG dùng dấu ```json. Chỉ trả về chuỗi JSON thuần tuý.

--- TÀI LIỆU ---
{context_text}"""

    try:
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt],
            config=types.GenerateContentConfig(temperature=0.2)
        )
        # Parse JSON
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
            
        tree_data = json.loads(text.strip())
        
        # Convert Tree -> ReactFlow format (Flat nodes/edges) 
        # Cần 1 logic xép toạ độ đơn giản
        nodes = []
        edges = []
        
        def traverse(node, x, y, parent_id=None, level=0):
            node_id = str(len(nodes) + 1)
            nodes.append({
                "id": node_id,
                "position": {"x": x, "y": y},
                "data": {"label": node.get("label", "")},
                "type": "default" if level > 0 else "input",
                "style": {"background": "#eef2fa", "border": "1px solid #1a56a0", "borderRadius": "8px", "padding": "10px", "fontWeight": "bold"} if level == 0 else {}
            })
            
            if parent_id:
                edges.append({
                    "id": f"e{parent_id}-{node_id}",
                    "source": parent_id,
                    "target": node_id,
                    "type": "smoothstep"
                })
                
            children = node.get("children", [])
            child_y = y + 100
            start_x = x - (len(children) * 150) / 2 + 75
            for i, child in enumerate(children):
                traverse(child, start_x + (i * 200), child_y, node_id, level + 1)
                
        traverse(tree_data, 250, 50)
        
        mm_data = {"nodes": nodes, "edges": edges, "layout_needed": True}
        
    except Exception as e:
        raise HTTPException(500, f"Lỗi sinh JSON từ AI: {e}")
        
    mm = NotebookMindmap(notebook_id=nb_id, title=body.title, data_json=mm_data)
    db.add(mm)
    db.commit()
    db.refresh(mm)
    
    return {"id": mm.id, "title": mm.title, "data": mm.data_json}

@router.put("/{nb_id}/mindmaps/{mm_id}")
async def update_mindmap(nb_id: int, mm_id: int, data: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    mm = db.query(NotebookMindmap).join(Notebook).filter(NotebookMindmap.id == mm_id, Notebook.user_id == user.id).first()
    if not mm:
        raise HTTPException(404, "Mindmap not found")
        
    mm.data_json = data.get("data", mm.data_json)
    db.commit()
    return {"success": True}

@router.delete("/{nb_id}/mindmaps/{mm_id}")
def delete_mindmap(nb_id: int, mm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    mm = db.query(NotebookMindmap).join(Notebook).filter(NotebookMindmap.id == mm_id, Notebook.user_id == user.id).first()
    if not mm:
        raise HTTPException(404, "Mindmap not found")
        
    db.delete(mm)
    db.commit()
    return {"success": True}
