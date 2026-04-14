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

---

## Bước 2: Chạy ứng dụng FastAPI ra public (ngrok)

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

## Bước 3: Cấu hình Webhook trên Facebook

1. Quay lại trang **Messenger** -> **API Setup** trên Facebook Developer.
2. Tại mục **Webhooks**, bấm **Configure**.
3. Sẽ hiện ra một popup yêu cầu điền:
   - **Callback URL:** Điền đường link webhook vừa có. VD: `https://a1b2-c3d4.ngrok-free.app/api/n8n/webhook`
   - **Verify Token:** Điền `my-fb-verify-token-2024` (Khớp với cấu hình trong `.env`).
   - Bấm **Verify and Save**. (Nếu backend đang chạy, nó sẽ verify thành công).
4. Ở ngay bên dưới chữ Webhook, bấm vào nút **Manage**. Check chọn `messages` và `messaging_postbacks`, rồi bấm Save.

> [!TIP]
> Hãy mở Messenger cá nhân ra, tìm kiếm tên Trang của bạn và gửi một tin nhắn bất kỳ. Bạn sẽ thấy log trong terminal của backend in ra tin nhắn đó! (Nếu n8n chưa chạy thì bot sẽ trả lời yêu cầu kết nối Email).

---

## Bước 4: Chạy n8n và Import Workflow

### Cài đặt n8n local
Mở một Terminal khác, chạy:
```bash
npx n8n
```
Truy cập `http://localhost:5678`, tạo một tài khoản admin.

### Workflow 1: Thông báo ôn tập định kỳ (Cron Trigger)

1. Tải file JSON đính kèm bên dưới, lưu thành file `n8n-cron-notify.json`.
2. Trong giao diện n8n, chọn **Workflows** -> Create New.
3. Nhấn vào menu 3 chấm (góc trên phải) -> **Import from file** -> Chọn file vừa tải.
4. **Quan trọng:**
   - Click đúp vào node HTTP Request "Lấy danh sách Users".
   - Sửa URL thành URL Ngrok của backend bạn. VD: `https://a1b2-c3d4.ngrok-free.app/api/n8n/users-due`
   - Sửa URL trong node HTTP Request "Gửi Messenger". Thêm Page Access Token vào.

### Copy & Paste JSON cho Workflow 1: N8n Cron Thông báo

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
      "id": "e9ebdcf9-0d36-4d2c-af87-3dcf2d137107",
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        200,
        280
      ]
    },
    {
      "parameters": {
        "url": "http://host.docker.internal:8000/api/n8n/users-due",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "secret",
              "value": "my-super-secret-n8n-key-2024"
            }
          ]
        },
        "options": {}
      },
      "id": "8447833a-67cc-44a5-9bb0-f47228892f39",
      "name": "Get Users Due",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [
        420,
        280
      ]
    },
    {
      "parameters": {
        "fieldToSplitOut": "data",
        "options": {}
      },
      "id": "04ec67eb-a6b1-4bb2-b5e0-51c8901eb4fc",
      "name": "Item Lists",
      "type": "n8n-nodes-base.itemLists",
      "typeVersion": 3,
      "position": [
        640,
        280
      ]
    },
    {
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.should_notify }}",
              "value2": true
            }
          ]
        }
      },
      "id": "c86c1add-b6aa-4c28-9104-585eecfaf385",
      "name": "If Has Due",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        860,
        280
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://graph.facebook.com/v19.0/me/messages",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "access_token",
              "value": "PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "recipient.id",
              "value": "={{ $json.psid }}"
            },
            {
              "name": "message.text",
              "value": "=Xin chào {{ $json.name }}! 🔔\n\nHôm nay bạn có {{ $json.due_today }} câu hỏi toán cần ôn tập.\nBạn cũng có {{ $json.due_next_7_days }} câu sắp đến hạn trong tuần này.\n\nNhắn \"gửi {{Math.min($json.due_today, 5)}} bài\" để bắt đầu luyện tập nha 💪"
            },
            {
              "name": "messaging_type",
              "value": "MESSAGE_TAG"
            },
            {
               "name": "tag",
               "value": "ACCOUNT_UPDATE"
            }
          ]
        },
        "options": {}
      },
      "id": "875b22b1-12c8-4720-bfcc-7ed2f205373a",
      "name": "Send Messenger",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [
        1100,
        260
      ]
    }
  ],
  "pinData": {},
  "connections": {
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "Get Users Due",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Users Due": {
      "main": [
        [
          {
            "node": "Item Lists",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Item Lists": {
      "main": [
        [
          {
            "node": "If Has Due",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "If Has Due": {
      "main": [
        [
          {
            "node": "Send Messenger",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  },
  "versionId": "65bcdf27-b52b-4226-aa09-3fed04c868eb",
  "id": "J1kL2R3q5y",
  "meta": {
    "instanceId": "dc8b5df4faac"
  },
  "tags": []
}
```

> [!TIP]
> Workflow 2 (Chatbot) thực tế ĐÃ ĐƯỢC XỬ LÝ TOÀN BỘ trong Router FastAPI (hàm POST `/api/n8n/webhook`).
> Vì vậy, chúng ta tối ưu hơn: chỉ cần Webhook Facebook trỏ thẳng tới Backend, Backend sẽ giao tiếp lại qua các Graph API của Messenger.
> N8n chỉ đóng vai trò chạy Scheduled Trigger định kỳ mỗi ngày. Giúp hệ thống đơn giản và ít tốn tài nguyên hơn!

---

## Tóm tắt lại luồng hoạt động
1. 8h sáng: N8N quét backend, gửi tín hiệu nhắc nhở "Hôm nay có bài" qua Facebook Messenger.
2. User bấm vào tin nhắn trên Messenger, chat "gửi tôi 5 bài"
3. Facebook gửi sự kiện chat vào Backend FastAPI qua webhook.
4. Backend nhận lệnh, Query DB, lấy ra 5 câu, gửi thẳng trả lại Messenger.
5. User nhận câu trả lời rất lẹ mà không cần build thêm flow lằng nhằng trong n8n cho chatbot.
