# Math Chatbot

Chatbot hỗ trợ học toán cấp 3 — chat học toán, upload đề từ ảnh, sinh đề ôn tập tự động, nhắc nhở ôn tập qua Facebook Messenger.

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI (Python)
- **Database**: MySQL 8 + ChromaDB
- **AI**: Google Gemini (chat + OCR ảnh đề)
- **Automation**: n8n (nhắc nhở ôn tập định kỳ qua Messenger)

## Khởi động nhanh

### 1. Chạy database + services (MySQL + Chroma + Adminer + n8n)

```bash
cd infra
cp .env.example .env        # điền mật khẩu nếu muốn thay
docker compose up -d
```

Kiểm tra tại:
- Adminer (quản lý MySQL): http://localhost:8080
- ChromaDB: http://localhost:8001
- n8n (automation): http://localhost:5678

### 2. Chạy Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env        # điền GEMINI_API_KEY và các biến FB
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

## n8n + Facebook Messenger Integration

### Tính năng
- 🔔 **Nhắc nhở hàng ngày**: n8n tự động gửi thông báo lúc 8h sáng cho user có câu đến hạn ôn
- 💬 **Chatbot Messenger**: User nhắn tin trên Messenger để nhận câu hỏi ôn tập
- 🔗 **Liên kết tài khoản**: User gõ email trên Messenger để liên kết với tài khoản hệ thống
- 📊 **Thống kê**: Xem số câu cần ôn ngay trên Messenger

### Thiết lập
Xem hướng dẫn chi tiết tại file [`walkthrough.md`](./walkthrough.md).

### Biến môi trường cần thiết (trong `backend/.env`)
```env
N8N_SECRET=your-secret-key
FB_PAGE_ACCESS_TOKEN=your-page-access-token
FB_VERIFY_TOKEN=your-verify-token
FB_PAGE_ID=your-page-id
FB_APP_SECRET=your-app-secret
```

## Cấu trúc thư mục

```
mathbot/
├── infra/                  # Docker Compose, SQL schema
│   ├── docker-compose.yml  # MySQL, ChromaDB, Adminer, n8n
│   ├── init.sql
│   └── .env
├── backend/                # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── chroma_client.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── problem.py
│   │   │   ├── library.py
│   │   │   ├── notification.py   # Notification logs
│   │   │   └── ...
│   │   ├── schemas/
│   │   ├── routers/
│   │   │   ├── n8n_webhook.py    # Facebook Messenger + n8n
│   │   │   ├── auth.py           # Auth + Messenger status
│   │   │   └── ...
│   │   └── services/
│   ├── requirements.txt
│   └── .env
├── frontend/               # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── SettingsPage.tsx  # Messenger integration UI
│   │   │   └── ...
│   │   ├── services/
│   │   ├── hooks/
│   │   └── types/
│   └── .env
├── n8n-cron-notify.json    # Workflow n8n (import vào n8n)
└── walkthrough.md          # Hướng dẫn tích hợp Messenger
```
