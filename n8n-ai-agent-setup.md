# Hướng dẫn Setup n8n AI Intent Parser

## Tổng quan

Workflow này biến Messenger chatbot từ "hard-coded intent" thành **AI Parser thông minh** sử dụng **Google Gemini**. 
Nó sẽ giúp hiểu ngôn ngữ tự nhiên, phân loại intent (hỏi bài tập, thống kê, hay trò chuyện phiếm), sau đó sinh JSON chuẩn hóa và gửi yêu cầu hành động xuống Backend (Xử lý DB, tạo báo cáo PDF,...). Luồng này gọn nhẹ vì các logic gọi DB được giữ lại tại Backend (FastAPI).

## Yêu cầu

- **n8n** v1.19+ (đã bundle sẵn `@n8n/n8n-nodes-langchain`)
- **Google Gemini API Key** (dùng chung key trong `backend/.env` đang có)

---

## Bước 1: Import Workflow

1. Mở n8n UI tại: **http://localhost:5678**
2. Click **"+" → Import from File**
3. Chọn file: `n8n-ai-agent-workflow.json`
4. Workflow **"MathBot - AI Chat Intent Parser"** sẽ xuất hiện

---

## Bước 2: Bật Google Gemini API

1. Mở workflow, click vào Node **"Google Gemini Chat Model"**
2. Cột bên tay phải (Credentials): Chọn **"Create New Credential"** hoặc tìm cái đã tạo.
3. Node "Google Gemini (PaLM) API": Nhập API Key vào khoảng trống "API Key".
4. Bấm **Save**.

---

## Bước 3: Test Workflow bằng Webhook Mock

1. Click nút tròn play (`Test Workflow`) để n8n lắng nghe.
2. Mở *Postman* hoặc dùng dòng lệnh PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:5678/webhook-test/ai-chat" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"user_id": 1, "user_name": "Test User", "psid": "testpsid123", "message": "hôm nay tôi cần ôn gì?"}'
```

3. Xem Output trên UI n8n, Node cuối cùng (`Respond to Webhook`) phải trả ra dạng biểu thức:
```json
{
  "reply": "Để mình xem thống kê hôm nay của bạn nhé!",
  "action": "get_stats",
  "num": 5,
  "days": 0
}
```

---

## Bước 4: Activate Workflow chạy thực tế

1. Bật **Active** toggle (Góc trên bên phải màn hình UI n8n).
2. Khi đó n8n Webhook sẽ chính thức hứng các API forward từ Python backend ở Endpoint sản phẩm (production): `http://localhost:5678/webhook/ai-chat`. 
3. Giờ bạn có thể vào trực tiếp Messeger trên Facebook chat tự nhiên:
   - "Lấy 10 bài tập hôm kia đi"
   - "Xem tình hình học tập"
   - "Chào bạn nhé, trời hôm nay ra sao?"

*(Các hành vi liên quan tới bài tập (action: get_questions/get_stats) sẽ được Backend hứng ngược lại và gọi SQL sinh file PDF trả lại cho học sinh.)*
