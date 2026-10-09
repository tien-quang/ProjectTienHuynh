#  TTTN Chatbot Nội Bộ

Hệ thống chatbot AI dành cho nhân viên nội bộ: hỏi đáp tài liệu (RAG), tra cứu sản phẩm và quản lý theo phòng ban.

🔗 **Live Demo:** im not share . if you want use that . Set up and run . its very easy 

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)

---

## 📑 Mục lục

1. [Tổng quan](#-tổng-quan)
2. [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
3. [Cấu trúc dự án](#-cấu-trúc-dự-án)
4. [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
5. [Cài đặt và chạy](#-cài-đặt-và-chạy)
6. [Cấu hình môi trường](#-cấu-hình-môi-trường)
7. [Tài khoản mặc định](#-tài-khoản-mặc-định)
8. [Tính năng](#-tính-năng)
9. [API Reference](#-api-reference)
10. [Lỗi thường gặp & cách fix](#-lỗi-thường-gặp--cách-fix)
11. [Deploy với Docker](#-deploy-với-docker)
12. [Ghi chú kỹ thuật](#-ghi-chú-kỹ-thuật)

---

##  Tổng quan

Dự án gồm 3 thành phần chạy độc lập:

- **Frontend** – giao diện web cho nhân viên, quản lý và admin.
- **Backend** – xử lý xác thực, phân quyền, CRUD dữ liệu.
- **AI Service** – microservice RAG: nhúng tài liệu, tìm kiếm vector và sinh câu trả lời.

### Stack công nghệ

| Lớp | Công nghệ |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, Zustand, React Query |
| Backend | Node.js, Express, MongoDB Atlas, JWT |
| AI Service | Python, FastAPI, LangGraph, ChromaDB, OpenAI |
| Fonts | Plus Jakarta Sans (UI), JetBrains Mono (code) |

---

## 🏗 Kiến trúc hệ thống

```mermaid
flowchart LR
    U[ User] --> FE[React Frontend]
    FE -->|Auth / CRUD| BE[Express Backend]
    FE -->|RAG / Chat| AI[FastAPI AI Service]
    BE --> DB[(MongoDB Atlas)]
    AI --> VS[(ChromaDB<br/>Vector Store)]
    AI --> LLM[OpenAI API]
```

---

##  Cấu trúc dự án

```text
TTTNCHATBOT/
├── frontend/                        # React App
│   ├── src/
│   │   ├── store/
│   │   │   └── authStore.js         # Zustand auth store (persist)
│   │   ├── context/
│   │   │   └── AuthContext.jsx      # React context wrap Zustand
│   │   ├── services/
│   │   │   └── api.js               # Axios + auto refresh token
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Layout.jsx           # Sidebar + topbar
│   │   │   │   └── NotificationBell.jsx
│   │   │   └── ui/
│   │   │       └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx        # Đăng nhập
│   │   │   │   ├── RegisterPage.jsx     # Đăng ký
│   │   │   │   └── ProfilePage.jsx      # Hồ sơ cá nhân
│   │   │   ├── chat/
│   │   │   │   └── ChatPage.jsx         # Chat AI + session sidebar
│   │   │   ├── products/
│   │   │   │   └── ProductsPage.jsx     # CRUD sản phẩm + upload ảnh
│   │   │   ├── knowledge/
│   │   │   │   └── KnowledgePage.jsx    # Upload & quản lý tài liệu
│   │   │   └── admin/
│   │   │       ├── DashboardPage.jsx    # Biểu đồ, thống kê
│   │   │       ├── UsersPage.jsx        # Quản lý người dùng
│   │   │       ├── DepartmentsPage.jsx  # Cấu hình phòng ban
│   │   │       └── AuditPage.jsx        # Audit log
│   │   ├── App.jsx                  # Routes
│   │   ├── main.jsx                 # Entry point
│   │   └── index.css                # Design system (TailwindCSS)
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/                         # Express API
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # Kết nối MongoDB Atlas
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT authenticate
│   │   │   └── auditMiddleware.js   # Ghi audit log
│   │   ├── models/                  # User, Department, ChatSession,
│   │   │                            # KnowledgeDocument, Product,
│   │   │                            # Notification, AuditLog
│   │   ├── routes/                  # auth, users, chat, knowledge,
│   │   │                            # products, departments, admin,
│   │   │                            # audit, notifications
│   │   ├── utils/
│   │   │   └── seed.js              # Seed data mẫu
│   │   └── server.js
│   ├── .env                         # ← PHẢI TỰ TẠO FILE NÀY
│   └── package.json
│
└── ai-service/                      # FastAPI AI
    ├── app/
    │   ├── api/                     # chat.py, knowledge.py, products.py
    │   ├── core/                    # config.py, chroma_client.py
    │   ├── graph/
    │   │   └── chat_graph.py        # LangGraph RAG pipeline
    │   ├── services/
    │   │   └── document_service.py
    │   └── main.py
    └── requirements.txt
```

---

##  Yêu cầu hệ thống

| Thành phần | Phiên bản / Yêu cầu |
|---|---|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Python | ≥ 3.10 (cho AI Service) |
| MongoDB Atlas | Tài khoản free tier là đủ |
| OpenAI API key | Cần cho AI Service |

---

##  Cài đặt và chạy

### Bước 1 — Tạo file `.env` cho Backend

Vào thư mục `backend/`, tạo file `.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/tttnchatbot?retryWrites=true&w=majority
JWT_SECRET=chuoi_bi_mat_it_nhat_32_ky_tu
JWT_REFRESH_SECRET=chuoi_bi_mat_refresh_it_nhat_32_ky_tu
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=sk-proj-...
AI_SERVICE_URL=http://localhost:8000
NODE_ENV=development
PORT=5000
```

>  Thay `MONGODB_URI` bằng connection string thật từ MongoDB Atlas.

<details>
<summary><b>Tạo nhanh bằng PowerShell (Windows)</b></summary>

```powershell
"MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tttnchatbot?retryWrites=true&w=majority`nJWT_SECRET=tttn_secret_2024`nJWT_REFRESH_SECRET=tttn_refresh_2024`nJWT_EXPIRES_IN=15m`nJWT_REFRESH_EXPIRES_IN=7d`nOPENAI_API_KEY=sk-proj-your-key`nAI_SERVICE_URL=http://localhost:8000`nNODE_ENV=development`nPORT=5000" | Set-Content .env -Encoding utf8
```

</details>

### Bước 2 — Cài và chạy Backend

```bash
cd backend
npm install
npm run dev
```

Kết quả thành công:

```text
MongoDB Atlas connected: ...
Bắt đầu seed database...
Đã tạo 4 phòng ban
Đã tạo master admin: admin@tttn.vn / Admin@123456
Backend running on port 5000
```

### Bước 3 — Cài và chạy Frontend

Mở terminal mới:

```bash
cd frontend
npm install
npm run dev
```

Truy cập: **http://localhost:5173**

### Bước 4 — Chạy AI Service (tuỳ chọn)

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

>  AI Service cần OpenAI API key mới hoạt động. Nếu chưa có, chatbot vẫn chạy nhưng không trả lời.

---

## 🔧 Cấu hình môi trường

### Lấy MongoDB URI từ Atlas

1. Vào [MongoDB Atlas](https://cloud.mongodb.com).
2. Chọn Cluster → **Connect** → **Connect your application**.
3. Copy URI, thay `<password>` bằng mật khẩu thật.
4. Thêm `/tttnchatbot` trước dấu `?`.

**Ví dụ URI hợp lệ:**

```text
mongodb+srv://myuser:mypass@cluster0.abc123.mongodb.net/tttnchatbot?retryWrites=true&w=majority
```

### Whitelist IP trong Atlas

Vào **Network Access** → **Add IP Address** → chọn **Allow Access from Anywhere** (`0.0.0.0/0`) khi phát triển.

---

##  Tài khoản mặc định

Được tạo tự động khi backend khởi động lần đầu:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Master Admin | `admin@tttn.vn` | `Admin@123456` |
| HR Manager | `hr.manager@tttn.vn` | `Manager@123` |
| IT Manager | `it.manager@tttn.vn` | `Manager@123` |
| Sales Manager | `sales.manager@tttn.vn` | `Manager@123` |
| Nhân viên | `an.nguyen@tttn.vn` | `Emp@123` |

>  Seed data chỉ chạy khi database **rỗng**. Muốn reset: xoá collection trong Atlas rồi restart backend.
>
>  Đây là tài khoản demo. Hãy đổi mật khẩu nếu deploy thật.

---

##  Tính năng

###  Đăng ký / Đăng nhập
- Trang đăng ký tại `/register`, tạo tài khoản role `employee`; admin phân phòng ban sau.
- JWT access token (15 phút) + refresh token (7 ngày), tự động rotate.
- Token lưu trong `localStorage` qua Zustand persist.

###  Chat AI
- Tạo session theo phòng ban, lịch sử hiển thị ở sidebar trái.
- Hỗ trợ Markdown trong phản hồi (bảng, code, danh sách...).
- Typing indicator khi AI đang xử lý.
- Đánh giá cuộc hội thoại (1–5 sao).
- Export chat ra file `.txt`, xoá session.

###  Tài liệu nội bộ
- Upload: PDF, DOCX, TXT, XLSX, CSV, MD (tối đa 50MB), hỗ trợ kéo thả.
- Master Admin chọn phòng ban khi upload; Manager tự upload vào phòng ban của mình.
- Tự động cập nhật trạng thái index mỗi 5 giây.
- Xem theo phòng ban, lọc theo trạng thái.

###  Sản phẩm
- Thêm / sửa / xoá sản phẩm, upload ảnh (JPG, PNG, WEBP, tối đa 5MB).
- Danh mục: Laptop, RAM, SSD, CPU, GPU, Màn hình, Linh kiện, Phụ kiện...
- Thông số kỹ thuật dạng JSON.
- Tìm kiếm, lọc theo danh mục, phân trang.

###  Quản lý người dùng (Manager / Admin)
- Tạo, sửa, xoá tài khoản.
- Phân quyền: `employee` / `manager` / `master_admin`.
- Phân phòng ban, reset mật khẩu.

###  Phòng ban (Master Admin)
- Cấu hình mô tả, màu sắc.
- Tin nhắn chào khi bắt đầu chat.
- System prompt AI riêng cho từng phòng ban.

###  Audit Log (Master Admin)
- Ghi lại mọi hành động: đăng nhập, tạo/xoá user, upload tài liệu...
- Xem chi tiết từng log, lọc theo loại hành động.

---

##  API Reference

**Base URL:** `http://localhost:5000/api`

<details>
<summary><b> Auth</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/login` | Đăng nhập |
| POST | `/auth/register` | Đăng ký tài khoản mới |
| POST | `/auth/refresh` | Làm mới access token |
| POST | `/auth/logout` | Đăng xuất |
| GET | `/auth/me` | Thông tin user hiện tại |

</details>

<details>
<summary><b> Users</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/users` | Danh sách users (có phân trang) |
| POST | `/users` | Tạo user mới |
| PUT | `/users/:id` | Cập nhật user |
| DELETE | `/users/:id` | Xoá user |
| POST | `/users/:id/reset-password` | Reset mật khẩu |

</details>

<details>
<summary><b> Chat</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/chat/sessions` | Danh sách session |
| POST | `/chat/sessions` | Tạo session mới |
| GET | `/chat/sessions/:id` | Chi tiết session + messages |
| POST | `/chat/sessions/:id/message` | Gửi tin nhắn |
| DELETE | `/chat/sessions/:id` | Xoá session |
| GET | `/chat/sessions/:id/export` | Export chat |
| POST | `/chat/sessions/:id/rating` | Đánh giá |

</details>

<details>
<summary><b> Knowledge</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/knowledge` | Danh sách tài liệu |
| POST | `/knowledge/upload` | Upload tài liệu (multipart) |
| DELETE | `/knowledge/:id` | Xoá tài liệu |
| POST | `/knowledge/:id/reindex` | Index lại tài liệu |

</details>

<details>
<summary><b> Products</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/products` | Danh sách sản phẩm |
| POST | `/products` | Tạo sản phẩm (multipart + image) |
| PUT | `/products/:id` | Cập nhật sản phẩm |
| DELETE | `/products/:id` | Xoá sản phẩm |

</details>

<details>
<summary><b> Departments · Admin ·  Audit ·  Notifications</b></summary>

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/departments` | Danh sách phòng ban |
| PUT | `/departments/:id` | Cập nhật phòng ban |
| GET | `/admin/dashboard` | Thống kê tổng quan |
| GET | `/audit` | Danh sách audit log |
| GET | `/notifications` | Danh sách thông báo |
| PUT | `/notifications/read-all` | Đánh dấu đọc hết |

</details>

---

## 🛠 Lỗi thường gặp & cách fix

###  `MongoDB connection error: querySrv ENOTFOUND`
- **Nguyên nhân:** File `.env` chưa được tạo hoặc bị lỗi encoding.
- **Fix:** chạy trong thư mục `backend/`:
  ```powershell
  "MONGODB_URI=mongodb+srv://..." | Set-Content .env -Encoding utf8
  ```

###  `Cannot find module './store/authStore'`
- **Nguyên nhân:** Thiếu file `src/store/authStore.js`.
- **Fix:** File này có sẵn trong project, hãy đảm bảo giải nén đúng thư mục.

### Vite lỗi import path
- **Nguyên nhân:** Có thể xuất hiện folder tên `{auth,chat,...}` do lỗi brace expansion của `mkdir` trên Linux.
- **Fix:** Xoá các folder tên lạ đó, chúng chỉ là artifact lỗi.

### Đăng ký không hoạt động
- **Nguyên nhân:** Backend chưa có route `/auth/register`.
- **Fix:** Route đã được thêm trong `backend/src/routes/auth.js`.

###  Upload ảnh sản phẩm không hoạt động
- **Nguyên nhân:** Route `/products` cần hỗ trợ `multipart/form-data` với field `image`.
- **Kiểm tra:** `backend/src/routes/products.js` phải dùng middleware `multer`.

### Không hiện dropdown chọn phòng ban khi upload tài liệu
- **Nguyên nhân:** Logic cũ chỉ hiện dropdown với `master_admin` và không fetch departments trước.
- **Fix:** Đã sửa, dropdown hiện với `master_admin` và user chưa có phòng ban; departments được fetch khi mở trang.

### Frontend chạy ở port 3000 thay vì 5173
- Vite mặc định dùng **5173**. Nếu thấy 3000 nghĩa là bạn đã config custom trong `vite.config.js`.

###  CORS error khi frontend gọi API
- **Fix:** `backend/src/server.js` phải có:
  ```js
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }))
  ```

---

##  Deploy với Docker

Tạo file `.env` ở thư mục gốc, sau đó chạy:

```bash
# Từ thư mục gốc TTTNCHATBOT/
docker-compose up --build
```

---

##  Ghi chú kỹ thuật

- **Auth system:** Dùng Zustand (`store/authStore.js`) làm single source of truth. `AuthContext` wrap lại Zustand để các component vẫn dùng `useAuth()` bình thường.
- **Token storage:** Access token & refresh token lưu trong `localStorage` key `tttn-auth` (Zustand persist). Axios interceptor tự đọc và tự refresh khi nhận 401.
- **Seed data:** Chỉ chạy 1 lần khi database rỗng (check `User.countDocuments() === 0`).
- **AI Service:** Là microservice độc lập, backend gọi qua HTTP. Nếu AI Service down, chat vẫn tạo được session nhưng không nhận được phản hồi AI.
