# Math Chatbot

Chatbot hỗ trợ học toán cấp 3 — chat học toán, upload đề từ ảnh, sinh đề ôn tập tự động.

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI (Python)
- **Database**: MySQL 8 + ChromaDB
- **AI**: OpenAI GPT-4o (chat + OCR ảnh đề)

## Khởi động nhanh

### 1. Chạy database (MySQL + Chroma + Adminer)

```bash
cd infra
cp .env.example .env        # điền mật khẩu nếu muốn thay
docker compose up -d
```

Kiểm tra tại:
- Adminer (quản lý MySQL): http://localhost:8080
- ChromaDB: http://localhost:8001

### 2. Chạy Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env        # điền OPENAI_API_KEY
uvicorn app.main:app --reload
```

API chạy tại: http://localhost:8000
Swagger docs: http://localhost:8000/docs

### 3. Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

App chạy tại: http://localhost:5173

## Adminer — đăng nhập

| Trường   | Giá trị        |
|----------|----------------|
| System   | MySQL          |
| Server   | mysql          |
| Username | mathbot_user   |
| Password | mathbot_pass123|
| Database | mathbot        |

## Cấu trúc thư mục

```
mathbot/
├── infra/                  # Docker Compose, SQL schema
│   ├── docker-compose.yml
│   ├── init.sql
│   └── .env
├── backend/                # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── chroma_client.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   └── services/
│   ├── requirements.txt
│   └── .env
└── frontend/               # React + TypeScript
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── services/
    │   ├── hooks/
    │   └── types/
    └── .env
```
