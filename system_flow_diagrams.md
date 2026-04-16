# 📊 Sơ đồ luồng hệ thống Math Chatbot

## 1. Kiến trúc tổng quan hệ thống

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend - React + Vite"]
        UI_Upload["📸 Upload Page"]
        UI_Chat["💬 Chat Page"]
        UI_Library["📚 Library Page"]
        UI_Review["📝 Review Page"]
        UI_Stats["📊 Stats Page"]
        UI_History["🕐 History Page"]
    end

    subgraph Backend["⚙️ Backend - FastAPI"]
        Auth["🔐 Auth Router"]
        Upload["📤 Upload Router"]
        Chat["💬 Chat Router"]
        Library["📁 Library Router"]
        Review["📝 Review Router"]
        Stats["📊 Stats Router"]
        N8N["🔔 N8N Webhook Router"]
    end

    subgraph Services["🛠️ Services Layer"]
        OCR["🔍 OCR Service"]
        LLM["🤖 LLM Service"]
        Embed["🧠 Embed Service"]
        ReviewSvc["📐 Review Service"]
        PDF["📄 PDF Service"]
    end

    subgraph External["☁️ External APIs"]
        Gemini["Google Gemini 2.5 Flash"]
        FB["Facebook Graph API"]
        N8N_Engine["n8n Automation"]
    end

    subgraph Storage["💾 Storage"]
        MySQL["MySQL Database"]
        Chroma["ChromaDB Vector Store"]
        Static["Static Files - Ảnh đề"]
    end

    Frontend -->|JWT Auth| Backend
    Upload --> OCR --> Gemini
    Upload --> Embed --> Chroma
    Chat --> LLM --> Gemini
    Review --> ReviewSvc
    N8N --> PDF
    N8N --> FB
    N8N_Engine -->|Cron Schedule| N8N
    Backend --> MySQL
    Upload --> Static
```

---

## 2. Luồng OCR — Upload ảnh đề thi

> **Endpoint:** `POST /api/upload/exam-image`
> **Files:** [upload.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/upload.py), [ocr_service.py](file:///d:/CODE/TA-ChatBot2/backend/app/services/ocr_service.py), [embed_service.py](file:///d:/CODE/TA-ChatBot2/backend/app/services/embed_service.py)

```mermaid
flowchart TD
    A["👤 User chụp ảnh đề toán"] --> B["📤 Upload ảnh qua Frontend"]
    B --> C{"🔍 Validate file"}
    C -->|"❌ Sai định dạng / quá 10MB"| D["⚠️ HTTP 400: Lỗi file"]
    C -->|"✅ OK"| E["📷 Đọc image_bytes"]

    E --> F["🤖 Gọi Gemini OCR\n(call_gemini_with_retry)"]

    F --> G{"Kết quả?"}
    G -->|"429 PerDay"| H["❌ HTTP 429: Hết quota ngày"]
    G -->|"429 Rate Limit"| I["⏳ Retry 15s/30s/45s"]
    I --> F
    G -->|"503 Overload"| J["⏳ Retry 1s/2s/4s"]
    J --> F
    G -->|"✅ JSON trả về"| K["📝 Parse JSON → list questions"]

    K --> L{"Có câu hỏi?"}
    L -->|"❌ Rỗng"| M["⚠️ HTTP 422: Không tìm thấy câu"]
    L -->|"✅ Có"| N["🔄 normalize_content\nChuẩn hóa LaTeX + format"]

    N --> O["💾 Lưu ảnh gốc\n→ /static/exams/{uuid}.jpg"]
    O --> P["💾 Tạo SourceExam\n→ MySQL"]
    P --> Q["🔁 Loop từng câu hỏi"]

    Q --> R["💾 Tạo Question\n→ MySQL"]
    R --> S["🧠 Embed vào ChromaDB\n(add_question)"]
    S --> T{"Còn câu?"}
    T -->|"Có"| Q
    T -->|"Hết"| U["✅ Commit DB\nTrả về SourceExamOut"]

    style F fill:#4285f4,color:#fff
    style S fill:#34a853,color:#fff
    style O fill:#fbbc04,color:#000
```

### Chi tiết xử lý OCR

| Bước | Component | Mô tả |
|------|-----------|-------|
| Validate | `upload.py` | Kiểm tra MIME type (JPEG/PNG/WEBP/HEIC), kích thước ≤ 10MB |
| OCR | `ocr_service.py` | Gemini 2.5 Flash + Structured Output (JSON schema) |
| Retry | `call_gemini_with_retry()` | 429 per-minute → wait 15s; 503 → exponential backoff |
| Normalize | `normalize_content()` | `\[...\]` → `$$...$$`, `\(...\)` → `$...$`, ép xuống dòng đáp án |
| Embed | `embed_service.py` | ChromaDB lưu vector content + metadata (topic, difficulty) |

---

## 3. Luồng Chat AI — Hỏi bài gia sư

> **Endpoints:** `POST /api/chat/sessions`, `POST /api/chat/sessions/{id}/messages`
> **Files:** [chat.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/chat.py), [llm_service.py](file:///d:/CODE/TA-ChatBot2/backend/app/services/llm_service.py)

```mermaid
flowchart TD
    A["👤 User mở Chat Page"] --> B["📱 Tạo hoặc chọn Session\nPOST /sessions"]
    B --> C["💬 User nhập câu hỏi"]
    C --> D["📨 POST /sessions/{id}/messages\n{message: '...'}"]

    D --> E["💾 Lưu user message\n→ MySQL (role=user)"]
    E --> F["📜 Load 20 tin nhắn gần nhất\n(history context)"]

    F --> G["🤖 Gọi Gemini 2.5 Flash\n(llm_service.chat)"]

    G --> H{"Kết quả?"}
    H -->|"429 PerDay"| I["⚠️ 'Hết hạn mức hôm nay'"]
    H -->|"429 Rate Limit"| J["⚠️ 'AI đang quá tải'"]
    H -->|"503 Unavailable"| K["⚠️ 'Tạm không khả dụng'"]
    H -->|"✅ OK"| L["📝 Nhận reply text"]

    I --> M["💾 Lưu bot message\n→ MySQL (role=assistant)"]
    J --> M
    K --> M
    L --> M

    M --> N["✅ Trả về MessageOut\n{role, content, created_at}"]
    N --> O["📱 Frontend render\nKaTeX + Markdown"]

    subgraph Gemini_Config["⚙️ Cấu hình Gemini"]
        direction LR
        P1["System Prompt:\nGia sư toán cấp 3 VN"]
        P2["Temperature: 0.3"]
        P3["Max tokens: 2000"]
        P4["Format: $...$ cho LaTeX"]
    end

    G -.-> Gemini_Config

    style G fill:#4285f4,color:#fff
    style M fill:#34a853,color:#fff
```

---

## 4. Luồng Ôn tập — Spaced Repetition (SM-2)

> **Endpoints:** `GET /api/review/needs-review`, `POST /api/review/questions/{id}/mark-reviewed`, `POST /api/review/generate`
> **Files:** [review.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/review.py), [review_service.py](file:///d:/CODE/TA-ChatBot2/backend/app/services/review_service.py)

```mermaid
flowchart TD
    A["👤 User mở Review Page"] --> B["📋 GET /needs-review\nLấy câu đến hạn ôn"]

    B --> C{"Filter logic"}
    C -->|"next_review_at ≤ now"| D["Câu đã đến hạn"]
    C -->|"next_review_at = NULL\n& last_used_at > 1 ngày"| E["Câu chưa ôn lần nào\nhoặc quá hạn"]
    D --> F["📝 Hiển thị danh sách câu cần ôn"]
    E --> F

    F --> G["👤 User ôn bài và chấm điểm"]
    G --> H["📨 POST /questions/{id}/mark-reviewed\n{quality: 0-5}"]

    H --> I["🔄 Cập nhật:\n• last_used_at = now\n• review_count += 1"]
    I --> J["📐 Tính SM-2"]

    J --> K{"quality < 3?"}
    K -->|"Có (Quên)"| L["interval = 1 ngày\n(Học lại ngay mai)"]
    K -->|"Không (Nhớ)"| M{"review_count?"}

    M -->|"≤ 1"| N["interval = 1 ngày"]
    M -->|"= 2"| O["interval = 6 ngày"]
    M -->|"> 2"| P["interval = interval × ease_factor"]

    L --> Q["📊 Cập nhật ease_factor\nef = ef + 0.1 - (5-q)×0.08\n(min 1.3)"]
    N --> Q
    O --> Q
    P --> Q

    Q --> R["📅 next_review_at = now + interval"]
    R --> S["✅ Commit → Trả về kết quả"]

    subgraph GenerateExam["📝 Tạo đề ôn tập"]
        T["POST /review/generate\n{topics, num_questions}"]
        T --> U["🧠 ChromaDB search\n(vector similarity)"]
        U --> V{"Có kết quả?"}
        V -->|"Có"| W["Lấy questions theo ID\nsắp xếp theo next_review_at"]
        V -->|"Không"| X["Fallback: Query MySQL\ntheo topic + review_at"]
        W --> Y["🔀 Shuffle + Tạo ReviewExam"]
        X --> Y
    end

    style J fill:#ff9800,color:#fff
    style Q fill:#4285f4,color:#fff
```

### Bảng tham số SM-2

| Quality | Ý nghĩa | Hành động |
|---------|---------|-----------|
| 0 | Quên hoàn toàn | Reset interval → 1 ngày |
| 1 | Nhớ rất khó | Reset interval → 1 ngày |
| 2 | Nhớ khó khăn | Reset interval → 1 ngày |
| 3 | Nhớ được (mặc định) | Tăng interval bình thường |
| 4 | Nhớ dễ dàng | Tăng interval bình thường |
| 5 | Rất dễ | Tăng interval bình thường |

---

## 5. Luồng Thông báo Messenger (n8n + Facebook)

> **Endpoints:** `POST /api/n8n/webhook`, `GET /api/n8n/users-due`
> **Files:** [n8n_webhook.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/n8n_webhook.py), [pdf_service.py](file:///d:/CODE/TA-ChatBot2/backend/app/services/pdf_service.py)

### 5a. Luồng nhận tin nhắn từ Messenger

```mermaid
flowchart TD
    A["👤 User gửi tin nhắn\nqua Facebook Messenger"] --> B["📨 Facebook gọi\nPOST /api/n8n/webhook"]
    B --> C{"🔐 Verify\nX-Hub-Signature-256"}
    C -->|"❌ Sai chữ ký"| D["HTTP 403"]
    C -->|"✅ OK"| E["📝 Parse body\nLấy sender PSID + text"]

    E --> F{"🔍 Tìm User\ntheo PSID?"}
    F -->|"❌ Chưa liên kết"| G{"Intent?"}
    G -->|"Có email"| H["🔗 Liên kết PSID → User"]
    G -->|"Không"| I["💬 'Gõ email để liên kết'"]

    F -->|"✅ Đã liên kết"| J["🧠 _parse_intent(text)"]

    J --> K{"Intent?"}
    K -->|"link_account"| H
    K -->|"help"| L["💬 Gửi menu hướng dẫn"]
    K -->|"get_stats"| M["📊 Gửi thống kê ôn tập"]
    K -->|"get_questions"| N["📄 _handle_get_questions"]
    K -->|"unknown"| O["💬 'Chưa hiểu, thử gõ...'"]

    style J fill:#ff9800,color:#fff
    style N fill:#4285f4,color:#fff
```

### 5b. Luồng xử lý "gửi câu hỏi" qua Messenger

```mermaid
flowchart TD
    A["🧠 _handle_get_questions\n(psid, user_id, intent)"] --> B["🔍 Query MySQL\nLấy N câu đến hạn"]

    B --> C{"Có câu?"}
    C -->|"❌ Không"| D["💬 '🎉 Không có câu cần ôn!'"]
    C -->|"✅ Có"| E{"Câu nào có ảnh?"}

    E -->|"Có"| F["💬 '📷 Câu 1, 3 có hình ảnh\ntrong file PDF'"]
    E -->|"Không"| G["Skip thông báo ảnh"]

    F --> H["💬 '⏳ Đang biên soạn PDF...'"]
    G --> H

    H --> I["📄 generate_questions_pdf()"]

    I --> J["🔄 Chuẩn bị data:\n• content, topic, review_count\n• Ảnh → base64 data URI"]
    J --> K["📝 Jinja2 render HTML\n(messenger_pdf.html)"]
    K --> L["💾 Ghi HTML → temp file"]
    L --> M["🎭 Playwright (sync, thread)\nMở HTML → Render KaTeX → PDF"]
    M --> N["📄 File PDF"]

    N --> O{"PDF OK?"}
    O -->|"❌ Lỗi"| P["💬 '❌ Lỗi kết xuất PDF'"]
    O -->|"✅ OK"| Q["📎 Gửi PDF qua\nFB Graph API\n(multipart/form-data)"]

    Q --> R{"Gửi OK?"}
    R -->|"✅"| S["💬 '💡 Đăng nhập web app\nđể đánh dấu đã ôn'"]
    R -->|"❌"| T["💬 '❌ FB từ chối file'"]

    S --> U["🗑️ Xóa file PDF tạm"]
    T --> U
    U --> V["📝 Log notification"]

    style I fill:#4285f4,color:#fff
    style M fill:#9c27b0,color:#fff
    style Q fill:#1877f2,color:#fff
```

### 5c. Luồng nhắc nhở tự động (n8n Cron)

```mermaid
flowchart TD
    A["⏰ n8n Schedule Trigger\n(Mỗi ngày 7:00 AM)"] --> B["📨 GET /api/n8n/users-due\n?secret=xxx"]
    B --> C["🔍 Query tất cả Users\ncó messenger_psid"]
    C --> D["🔁 Loop từng user"]
    D --> E["📊 Đếm câu cần ôn\n(due_today, due_week)"]
    E --> F{"due_today > 0?"}
    F -->|"Có"| G["✅ should_notify: true"]
    F -->|"Không"| H["❌ should_notify: false"]
    G --> I["📨 n8n gửi tin nhắn\nnhắc ôn tập"]
    H --> J["Skip user này"]

    style A fill:#ff6d00,color:#fff
    style I fill:#1877f2,color:#fff
```

### 5d. Luồng phân tích Intent

```mermaid
flowchart TD
    A["📝 Text input từ user"] --> B{"Có email\npattern?"}
    B -->|"✅"| C["→ link_account"]

    B -->|"❌"| D{"Có từ khóa\nhelp/hướng dẫn/giúp?"}
    D -->|"✅"| E["→ help"]

    D -->|"❌"| F{"Có từ khóa\nthống kê/bao nhiêu?"}
    F -->|"✅"| G["→ get_stats"]

    F -->|"❌"| H{"Match pattern\n'gửi/cho/lấy N câu/bài'?"}
    H -->|"✅"| I["→ get_questions\n(num, days)"]

    H -->|"❌"| J{"Có từ khóa\nôn tập/review?"}
    J -->|"✅"| K["→ get_questions\n(default 5 câu)"]

    J -->|"❌"| L["→ unknown"]

    style C fill:#34a853,color:#fff
    style E fill:#4285f4,color:#fff
    style G fill:#ff9800,color:#fff
    style I fill:#9c27b0,color:#fff
    style K fill:#9c27b0,color:#fff
    style L fill:#666,color:#fff
```

---

## 6. Luồng Thư viện câu hỏi

> **Endpoints:** `/api/library/folders/*`, `/api/library/sets/*`
> **File:** [library.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/library.py)

```mermaid
flowchart TD
    A["👤 User mở Library Page"] --> B["📁 GET /folders\nLấy tất cả folders"]

    B --> C["📂 Hiển thị cây thư mục"]

    C --> D{"Thao tác?"}

    D -->|"Tạo folder"| E["POST /folders\n{name: '...'}"]
    D -->|"Đổi tên folder"| F["PATCH /folders/{id}\n{name: '...'}"]
    D -->|"Xóa folder"| G["DELETE /folders/{id}\n(cascade xóa sets)"]

    D -->|"Tạo tập câu hỏi"| H["POST /folders/{id}/sets\n{name: '...'}"]
    D -->|"Xem câu trong tập"| I["GET /sets/{id}/questions"]

    D -->|"Thêm câu vào tập"| J["POST /sets/{id}/questions\n{question_id}"]
    D -->|"Xóa câu khỏi tập"| K["DELETE /sets/{id}/questions/{qid}"]

    J --> L{"Câu đã thuộc\ntập khác?"}
    L -->|"✅ Đã có"| M["❌ HTTP 409:\nCâu đã nằm trong tập khác"]
    L -->|"❌ Chưa"| N["✅ Thêm vào\nquestion_set_items"]

    subgraph Structure["📊 Cấu trúc dữ liệu"]
        direction TB
        S1["📁 Folder"] --> S2["📋 QuestionSet"]
        S2 --> S3["❓ Question\n(M2M qua question_set_items)"]
    end

    style J fill:#4285f4,color:#fff
    style M fill:#f44336,color:#fff
```

---

## 7. Luồng Xác thực (Authentication)

> **Endpoints:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
> **File:** [auth.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/auth.py)

```mermaid
flowchart TD
    subgraph Register["📝 Đăng ký"]
        A1["POST /auth/register\n{name, email, password, grade}"]
        A1 --> A2{"Email đã tồn tại?"}
        A2 -->|"✅"| A3["❌ HTTP 400"]
        A2 -->|"❌"| A4["🔐 hash_password(bcrypt)"]
        A4 --> A5["💾 Tạo User → MySQL"]
        A5 --> A6["🎫 create_token(JWT)\nTrả về {access_token, user}"]
    end

    subgraph Login["🔑 Đăng nhập"]
        B1["POST /auth/login\n{email, password}"]
        B1 --> B2{"User tồn tại?\nPassword đúng?"}
        B2 -->|"❌"| B3["❌ HTTP 401"]
        B2 -->|"✅"| B4["🎫 create_token(JWT)\nTrả về {access_token, user}"]
    end

    subgraph Protected["🛡️ Protected Routes"]
        C1["Request với header:\nAuthorization: Bearer {token}"]
        C1 --> C2["🔐 get_current_user()"]
        C2 --> C3{"Token hợp lệ?"}
        C3 -->|"❌"| C4["❌ HTTP 401"]
        C3 -->|"✅"| C5["✅ Trả về User object\n→ Inject vào route handler"]
    end

    subgraph Messenger_Link["🔗 Liên kết Messenger"]
        D1["GET /auth/messenger-status"]
        D1 --> D2["Trả về {linked, psid}"]
        D3["POST /auth/unlink-messenger"]
        D3 --> D4["Xóa messenger_psid\n→ Hủy liên kết"]
    end

    style A6 fill:#34a853,color:#fff
    style B4 fill:#34a853,color:#fff
    style C5 fill:#4285f4,color:#fff
```

---

## 8. Luồng Thống kê (Stats & Gamification)

> **Endpoints:** `GET /api/stats/overview`, `POST /api/stats/session/start`, `POST /api/stats/session/end/{id}`
> **File:** [stats.py](file:///d:/CODE/TA-ChatBot2/backend/app/routers/stats.py)

```mermaid
flowchart TD
    A["👤 User mở Stats Page"] --> B["📊 GET /stats/overview"]

    B --> C["🔢 Query tổng hợp"]

    C --> D["📌 Tổng quan:\n• total_questions\n• reviewed_questions\n• due_today / tomorrow / week\n• streak"]

    C --> E["📊 Charts:\n• topics (theo chủ đề)\n• difficulty (theo độ khó)\n• heatmap 12 tuần\n• weekly 8 tuần\n• due_forecast 14 ngày"]

    C --> F["⏱️ Study Time:\n• total_study_minutes\n• daily_time 7 ngày\n• page_time theo trang"]

    C --> G["🏅 Badges:\n• first_upload (📸)\n• reviewed_10/50/100\n• streak_3/7/30\n• bank_50\n• time_60/600"]

    D --> H["📱 Frontend render\nDashboard"]
    E --> H
    F --> H
    G --> H

    subgraph StudySession["⏱️ Tracking thời gian học"]
        S1["User mở trang\n→ POST /session/start\n{page: 'chat'}"]
        S1 --> S2["💾 Tạo StudySession\nstarted_at = now"]
        S2 --> S3["User rời trang / đóng tab\n→ POST /session/end/{id}"]
        S3 --> S4["📊 duration = min(diff, 7200)\n(tối đa 2 tiếng)"]
    end

    subgraph Streak["🔥 Tính Streak"]
        K1["Kiểm tra hôm nay\ncó hoạt động?"]
        K1 -->|"Có"| K2["Đếm ngược từ hôm nay"]
        K1 -->|"Không"| K3["Đếm ngược từ hôm qua"]
        K2 --> K4["Đếm ngày liên tiếp\ncó last_used_at"]
        K3 --> K4
    end

    style H fill:#4285f4,color:#fff
```

---

## 9. Sơ đồ Database (Entity Relationship)

```mermaid
erDiagram
    User ||--o{ SourceExam : "uploads"
    User ||--o{ Question : "owns"
    User ||--o{ ChatSession : "creates"
    User ||--o{ Folder : "owns"
    User ||--o{ QuestionSet : "owns"
    User ||--o{ ReviewExam : "takes"
    User ||--o{ StudySession : "tracks"

    SourceExam ||--o{ Question : "contains"

    ChatSession ||--o{ Message : "has"

    Folder ||--o{ QuestionSet : "contains"

    QuestionSet }o--o{ Question : "M2M via question_set_items"

    ReviewExam }o--o{ Question : "M2M"

    User {
        int id PK
        string name
        string email
        string password
        string grade
        string messenger_psid
    }

    SourceExam {
        int id PK
        int user_id FK
        string title
        string image_url
        datetime created_at
    }

    Question {
        int id PK
        int source_exam_id FK
        int user_id FK
        text content
        string topic
        enum difficulty
        bool has_image
        string chroma_id
        datetime last_used_at
        int review_count
        datetime next_review_at
        int interval_days
        float ease_factor
    }

    ChatSession {
        int id PK
        int user_id FK
        datetime created_at
    }

    Message {
        int id PK
        int session_id FK
        string role
        text content
        datetime created_at
    }

    Folder {
        int id PK
        int user_id FK
        string name
    }

    QuestionSet {
        int id PK
        int user_id FK
        int folder_id FK
        string name
    }

    StudySession {
        int id PK
        int user_id FK
        string page
        datetime started_at
        datetime ended_at
        int duration_seconds
    }
```
