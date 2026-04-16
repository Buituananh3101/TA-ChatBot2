# Hướng dẫn Tích hợp Facebook Messenger + n8n cho ChatBot Toán Học

Sau khi đã hoàn tất các thay đổi mã nguồn ở Backend, đây là hướng dẫn các bước bạn cần thực hiện thủ công để hoàn thành hệ thống.

---

## Bước 1: Thiết lập Facebook Developer App

> [!IMPORTANT]
> Cần có sẵn một Trang (Facebook Page). Ví dụ: "Toán Học Chatbot". Nếu chưa có, hãy tạo mới: https://www.facebook.com/pages/create/

1. Truy cập [Facebook Developers](https://developers.facebook.com/).
2. Chọn **My Apps** -> **Create App**.
3. Chọn loại ứng dụng: **Other** -> chọn tiếp **Business**.
4. Đặt tên App (Ví dụ: `MathBot Messenger`) -> Tạo App.
5. Tại trang Dashboard của App, kéo xuống tìm **Messenger**, bấm **Set Up**.
6. Trong mục **Messenger** -> **API Setup**:
   - Ở phần **Generate Access Token**, chọn Trang Facebook của bạn.
   - Nó sẽ hiển thị một chuỗi dài. Đây chính là `PAGE_ACCESS_TOKEN`.
   - Copy chuỗi này và dán vào file `backend/.env` (biến `FB_PAGE_ACCESS_TOKEN`).
7. Lấy thêm các thông tin sau vào file `backend/.env`:
   - `FB_PAGE_ID`: ID của trang Facebook (hiển thị ở mục Page Info).
   - `FB_APP_SECRET`: Trong **Settings** -> **Basic** -> **App Secret** (bấm Show).

---

## Bước 2: Cấu hình file .env

Đảm bảo file `backend/.env` có đủ các biến sau:

```env
# n8n / Facebook Messenger integration
N8N_SECRET=your-super-secret-n8n-key
FB_PAGE_ACCESS_TOKEN=paste-your-page-access-token-here
FB_VERIFY_TOKEN=my-fb-verify-token-2024
FB_PAGE_ID=123456789012345
FB_APP_SECRET=your-facebook-app-secret
NOTIFICATION_SECRET=your-notification-secret
```

> [!WARNING]
> Không sử dụng giá trị mặc định cho các secret! Hệ thống sẽ cảnh báo nếu phát hiện secret yếu.

---

## Bước 3: Chạy ứng dụng FastAPI ra public (ngrok)

Facebook cần một đường link HTTPS công khai để gọi Webhook của chúng ta.
Lúc này bạn đang chạy backend ở local (`localhost:8000`), vậy nên cần dùng `ngrok`.

1. Cài đặt ngrok: https://ngrok.com/download
2. Mở Terminal, chạy backend:
   ```bash
   cd backend
   .\venv\Scripts\Activate
   uvicorn app.main:app --reload --port 8000
   ```
3. Mở một Terminal khác, chạy ngrok:
   ```bash
   ngrok http 8000
   ```
4. Copy đường link HTTPS ngrok tạo ra. Giả sử là `https://a1b2-c3d4.ngrok-free.app`.
   - Đây sẽ là base URL của backend.
   - Webhook URL tương ứng sẽ là: `https://a1b2-c3d4.ngrok-free.app/api/n8n/webhook`

---

## Bước 4: Cấu hình Webhook trên Facebook

1. Quay lại trang **Messenger** -> **API Setup** trên Facebook Developer.
2. Tại mục **Webhooks**, bấm **Configure**.
3. Sẽ hiện ra một popup yêu cầu điền:
   - **Callback URL:** Điền đường link webhook vừa có. VD: `https://a1b2-c3d4.ngrok-free.app/api/n8n/webhook`
   - **Verify Token:** Điền giá trị trùng với `FB_VERIFY_TOKEN` trong `.env`.
   - Bấm **Verify and Save**. (Nếu backend đang chạy, nó sẽ verify thành công).
4. Ở ngay bên dưới chữ Webhook, bấm vào nút **Manage**. Check chọn `messages` và `messaging_postbacks`, rồi bấm Save.

> [!TIP]
> Hãy mở Messenger cá nhân ra, tìm kiếm tên Trang của bạn và gửi một tin nhắn bất kỳ. Bạn sẽ thấy log trong terminal của backend in ra tin nhắn đó! (Nếu n8n chưa chạy thì bot sẽ trả lời yêu cầu kết nối Email).

---

## Bước 5: Chạy n8n và Import Workflow

### Cách 1: Chạy n8n qua Docker (khuyến nghị)

n8n đã được thêm vào `docker-compose.yml`. Chỉ cần:
```bash
cd infra
docker compose up -d
```
Truy cập `http://localhost:5678`, tạo một tài khoản admin.

### Cách 2: Chạy n8n local

```bash
npx n8n
```
Truy cập `http://localhost:5678`, tạo một tài khoản admin.

### Import Workflow

1. Tải file `n8n-cron-notify.json` ở thư mục gốc project.
2. Trong giao diện n8n, chọn **Workflows** -> Create New.
3. Nhấn vào menu 3 chấm (góc trên phải) -> **Import from file** -> Chọn file vừa tải.
4. **Quan trọng – Cấu hình lại URL và token:**
   - Click đúp vào node **"Get Users Due"**.
   - Sửa URL thành URL Ngrok của backend bạn. VD: `https://a1b2-c3d4.ngrok-free.app/api/n8n/users-due`
   - Sửa giá trị `secret` query param cho khớp với `N8N_SECRET` trong `.env`.
   - Click đúp vào node **"Send Messenger"**.
   - Sửa `access_token` thành Page Access Token của bạn.
5. Bấm **Activate** (toggle góc trên phải) để bật workflow.

### Copy & Paste JSON cho Workflow

Bạn có thể copy thẳng đoạn JSON dưới đây và dán vào canvas của n8n bằng phím Ctrl+V / Cmd+V.

```json
{
  "name": "MathBot - Daily Review Reminders",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 8 * * *"
            }
          ]
        }
      },
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [200, 280]
    },
    {
      "parameters": {
        "url": "http://host.docker.internal:8000/api/n8n/users-due",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "secret", "value": "YOUR_N8N_SECRET" }
          ]
        }
      },
      "name": "Get Users Due",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [420, 280]
    },
    {
      "parameters": { "fieldToSplitOut": "data" },
      "name": "Split Users",
      "type": "n8n-nodes-base.itemLists",
      "typeVersion": 3,
      "position": [640, 280]
    },
    {
      "parameters": {
        "conditions": {
          "boolean": [
            { "value1": "={{ $json.should_notify }}", "value2": true }
          ]
        }
      },
      "name": "If Has Due",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [860, 280]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=https://graph.facebook.com/v19.0/YOUR_PAGE_ID/messages",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "access_token", "value": "YOUR_PAGE_ACCESS_TOKEN" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={ \"recipient\": { \"id\": \"{{ $json.psid }}\" }, \"message\": { \"text\": \"Xin chào {{ $json.name }}! 🔔\\n\\nHôm nay bạn có {{ $json.due_today }} câu hỏi toán cần ôn tập.\\nBạn cũng có {{ $json.due_next_7_days }} câu sắp đến hạn trong tuần này.\\n\\nNhắn \\\"gửi {{ Math.min($json.due_today, 5) }} bài\\\" để bắt đầu luyện tập nha 💪\" }, \"messaging_type\": \"UPDATE\" }"
      },
      "name": "Send Messenger",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1100, 260]
    }
  ],
  "connections": {
    "Schedule Trigger": { "main": [[{ "node": "Get Users Due", "type": "main", "index": 0 }]] },
    "Get Users Due": { "main": [[{ "node": "Split Users", "type": "main", "index": 0 }]] },
    "Split Users": { "main": [[{ "node": "If Has Due", "type": "main", "index": 0 }]] },
    "If Has Due": { "main": [[{ "node": "Send Messenger", "type": "main", "index": 0 }]] }
  },
  "active": false
}
```

> [!TIP]
> Workflow 2 (Chatbot) thực tế ĐÃ ĐƯỢC XỬ LÝ TOÀN BỘ trong Router FastAPI (hàm POST `/api/n8n/webhook`).
> Vì vậy, chúng ta tối ưu hơn: chỉ cần Webhook Facebook trỏ thẳng tới Backend, Backend sẽ giao tiếp lại qua các Graph API của Messenger.
> N8n chỉ đóng vai trò chạy Scheduled Trigger định kỳ mỗi ngày. Giúp hệ thống đơn giản và ít tốn tài nguyên hơn!

---

## Bước 6: Kiểm tra liên kết Messenger từ Frontend

1. Đăng nhập vào ứng dụng web.
2. Vào trang **⚙️ Cài đặt** trên thanh navigation.
3. Xem trạng thái liên kết Messenger:
   - **Chưa liên kết**: Làm theo hướng dẫn trên trang để liên kết qua Messenger.
   - **Đã liên kết**: Có thể hủy liên kết nếu cần.

---

## Bảo mật

Hệ thống áp dụng các cơ chế bảo mật sau:

- **X-Hub-Signature-256**: Facebook gửi chữ ký HMAC-SHA256 cho mỗi webhook event. Backend verify chữ ký này bằng `FB_APP_SECRET`.
- **N8N_SECRET**: Tất cả endpoint n8n gọi đều yêu cầu query param `?secret=xxx`.
- **Cảnh báo secret yếu**: Backend tự động cảnh báo nếu phát hiện secret vẫn dùng giá trị mặc định.
- **Retry logic**: Gửi tin nhắn Messenger có retry với exponential backoff khi gặp rate limit hoặc server error.
- **Notification logs**: Mỗi thông báo đều được ghi log vào bảng `notification_logs` để theo dõi.

---

## Tóm tắt lại luồng hoạt động

1. 8h sáng: n8n gọi `GET /api/n8n/users-due` → Lấy danh sách user có câu đến hạn.
2. n8n lọc user cần thông báo (`should_notify = true`).
3. n8n gửi tin nhắn nhắc nhở qua Facebook Messenger API.
4. User bấm vào tin nhắn, chat "gửi tôi 5 bài".
5. Facebook gửi sự kiện chat vào Backend FastAPI qua webhook.
6. Backend xác thực chữ ký, phân tích intent, Query DB, gửi câu hỏi trả lại Messenger.
7. User nhận câu trả lời rất lẹ mà không cần build thêm flow lằng nhằng trong n8n cho chatbot.
