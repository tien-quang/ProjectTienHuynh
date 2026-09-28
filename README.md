# TTTN Chatbot Nội Bộ
Live Demo:** https://chatbotrag-taupe.vercel.app
Hệ thống chatbot AI dành cho nhân viên nội bộ, hỗ trợ hỏi đáp tài liệu, tra cứu sản phẩm và quản lý theo phòng ban.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Tài khoản mặc định](#tài-khoản-mặc-định)
- [Tính năng](#tính-năng)
- [API Reference](#api-reference)
- [Lỗi thường gặp & cách fix](#lỗi-thường-gặp--cách-fix)

---

## Tổng quan

**Stack công nghệ:**

| Lớp | Công nghệ |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, Zustand, React Query |
| Backend | Node.js, Express, MongoDB Atlas, JWT |
| AI Service | Python, FastAPI, LangGraph, ChromaDB, OpenAI |
| Fonts | Plus Jakarta Sans (UI), JetBrains Mono (code) |

**Luồng hoạt động:**
```
User → React Frontend → Express Backend (Auth/CRUD)
                      ↘ FastAPI AI Service (RAG / Chat)
                            ↘ ChromaDB (Vector Store)
                            ↘ OpenAI API (LLM)
```

---

## Cấu trúc dự án

```
TTTNCHATBOT/
├── frontend/                    # React App
│   ├── src/
│   │   ├── store/
│   │   │   └── authStore.js     # Zustand auth store (persist)
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # React context wrapping zustand
│   │   ├── services/
│   │   │   └── api.js           # Axios + auto token refresh
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Layout.jsx          # Sidebar + topbar
│   │   │   │   └── NotificationBell.jsx
│   │   │   └── ui/
│   │   │       └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx    # Đăng nhập
│   │   │   │   ├── RegisterPage.jsx # Đăng ký (mới)
│   │   │   │   └── ProfilePage.jsx  # Hồ sơ cá nhân
│   │   │   ├── chat/
│   │   │   │   └── ChatPage.jsx     # Chat AI với session sidebar
│   │   │   ├── products/
│   │   │   │   └── ProductsPage.jsx # CRUD sản phẩm + upload ảnh
│   │   │   ├── knowledge/
│   │   │   │   └── KnowledgePage.jsx # Upload & quản lý tài liệu
│   │   │   └── admin/
│   │   │       ├── DashboardPage.jsx   # Biểu đồ, thống kê
│   │   │       ├── UsersPage.jsx       # Quản lý người dùng
│   │   │       ├── DepartmentsPage.jsx # Cấu hình phòng ban
│   │   │       └── AuditPage.jsx       # Audit log
│   │   ├── App.jsx              # Routes
│   │   ├── main.jsx             # Entry point
│   │   └── index.css            # Design system (TailwindCSS)
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/                     # Express API
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js      # MongoDB Atlas connect
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT authenticate middleware
│   │   │   └── auditMiddleware.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Department.js
│   │   │   ├── ChatSession.js
│   │   │   ├── KnowledgeDocument.js
│   │   │   ├── Product.js
│   │   │   ├── Notification.js
│   │   │   └── AuditLog.js
│   │   ├── routes/
│   │   │   ├── auth.js          # Login, Register, Refresh, Logout
│   │   │   ├── users.js
│   │   │   ├── chat.js
│   │   │   ├── knowledge.js
│   │   │   ├── products.js
│   │   │   ├── departments.js
│   │   │   ├── admin.js
│   │   │   ├── audit.js
│   │   │   └── notifications.js
│   │   ├── utils/
│   │   │   └── seed.js          # Seed data mẫu
│   │   └── server.js
│   ├── .env                     # ← PHẢI TẠO FILE NÀY
│   └── package.json
│
└── ai-service/                  # FastAPI AI
    ├── app/
    │   ├── api/
    │   │   ├── chat.py
    │   │   ├── knowledge.py
    │   │   └── products.py
    │   ├── core/
    │   │   ├── config.py
    │   │   └── chroma_client.py
    │   ├── graph/
    │   │   └── chat_graph.py    # LangGraph RAG pipeline
    │   ├── services/
    │   │   └── document_service.py
    │   └── main.py
    └── requirements.txt
```

---

## Yêu cầu hệ thống

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- **Python** ≥ 3.10 (cho AI Service)
- **MongoDB Atlas** account (free tier đủ dùng)
- **OpenAI API key** (cho AI Service)

---

## Cài đặt và chạy

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

>  Thay `MONGODB_URI` bằng connection string thật của bạn từ MongoDB Atlas.

**Tạo nhanh bằng PowerShell (Windows):**
```powershell
"MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tttnchatbot?retryWrites=true&w=majority`nJWT_SECRET=tttn_secret_2024`nJWT_REFRESH_SECRET=tttn_refresh_2024`nJWT_EXPIRES_IN=15m`nJWT_REFRESH_EXPIRES_IN=7d`nOPENAI_API_KEY=sk-proj-your-key`nAI_SERVICE_URL=http://localhost:8000`nNODE_ENV=development`nPORT=5000" | Set-Content .env -Encoding utf8
```

### Bước 2 — Cài và chạy Backend

```bash
cd backend
npm install
npm run dev
```

Kết quả thành công:
```
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

> AI Service cần OpenAI API key mới hoạt động. Nếu chưa có, chatbot vẫn chạy nhưng không trả lời.

---

## Cấu hình môi trường

### Lấy MongoDB URI từ Atlas

1. Vào [MongoDB Atlas](https://cloud.mongodb.com)
2. Chọn Cluster → **Connect** → **Connect your application**
3. Copy URI, thay `<password>` bằng mật khẩu thật
4. Thêm `/tttnchatbot` trước dấu `?`

**Ví dụ URI hợp lệ:**
```
mongodb+srv://myuser:mypass@cluster0.abc123.mongodb.net/tttnchatbot?retryWrites=true&w=majority
```

### Whitelist IP trong Atlas

Vào **Network Access** → **Add IP Address** → chọn **Allow Access from Anywhere** (0.0.0.0/0) khi dev.

---

## Tài khoản mặc định

Được tạo tự động khi backend khởi động lần đầu:

| Role | Email | Mật khẩu |
|---|---|---|
| Master Admin | admin@tttn.vn | Admin@123456 |
| HR Manager | hr.manager@tttn.vn | Manager@123 |
| IT Manager | it.manager@tttn.vn | Manager@123 |
| Sales Manager | sales.manager@tttn.vn | Manager@123 |
| Nhân viên | an.nguyen@tttn.vn | Emp@123 |

> Seed data chỉ chạy khi database **rỗng**. Nếu muốn reset, xóa collection trong Atlas rồi restart backend.

---

## Tính năng

### Đăng ký / Đăng nhập
- Trang đăng ký mới tại `/register`
- Đăng ký tạo tài khoản role `employee`, admin phân phòng ban sau
- JWT access token (15 phút) + refresh token (7 ngày) tự động rotate
- Token lưu trong `localStorage` qua Zustand persist

### Chat AI
- Tạo session theo phòng ban
- Lịch sử session hiển thị sidebar trái
- Hỗ trợ Markdown trong phản hồi AI (bảng, code, danh sách...)
- Typing indicator khi AI đang xử lý
- Đánh giá cuộc hội thoại (1–5 sao)
- Export chat ra file `.txt`
- Xoá session

### Tài liệu nội bộ
- Upload: PDF, DOCX, TXT, XLSX, CSV, MD (tối đa 50MB)
- Kéo thả file
- Master Admin chọn phòng ban khi upload
- Manager tự động upload vào phòng ban của mình
- Auto-refresh trạng thái index mỗi 5 giây
- Xem theo phòng ban, lọc theo trạng thái

### Sản phẩm
- Thêm/sửa/xóa sản phẩm
- **Upload ảnh sản phẩm** (JPG, PNG, WEBP, tối đa 5MB)
- Danh mục: Laptop, RAM, SSD, CPU, GPU, Màn hình, Linh kiện, Phụ kiện...
- Thông số kỹ thuật dạng JSON
- Tìm kiếm, lọc theo danh mục
- Phân trang

### Quản lý người dùng (Manager/Admin)
- Tạo, sửa, xóa tài khoản
- Phân quyền: employee / manager / master_admin
- Phân phòng ban
- Reset mật khẩu

### Phòng ban (Master Admin)
- Cấu hình mô tả, màu sắc
- Tin nhắn chào khi bắt đầu chat
- System prompt AI riêng cho từng phòng ban

### Audit Log (Master Admin)
- Ghi lại toàn bộ hành động: login, tạo/xóa user, upload tài liệu...
- Xem chi tiết từng log
- Lọc theo loại hành động

---

## API Reference

Base URL: `http://localhost:5000/api`

### Auth
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/login` | Đăng nhập |
| POST | `/auth/register` | Đăng ký tài khoản mới |
| POST | `/auth/refresh` | Làm mới access token |
| POST | `/auth/logout` | Đăng xuất |
| GET | `/auth/me` | Thông tin user hiện tại |

### Users
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/users` | Danh sách users (có phân trang) |
| POST | `/users` | Tạo user mới |
| PUT | `/users/:id` | Cập nhật user |
| DELETE | `/users/:id` | Xóa user |
| POST | `/users/:id/reset-password` | Reset mật khẩu |

### Chat
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/chat/sessions` | Danh sách session |
| POST | `/chat/sessions` | Tạo session mới |
| GET | `/chat/sessions/:id` | Chi tiết session + messages |
| POST | `/chat/sessions/:id/message` | Gửi tin nhắn |
| DELETE | `/chat/sessions/:id` | Xóa session |
| GET | `/chat/sessions/:id/export` | Export chat |
| POST | `/chat/sessions/:id/rating` | Đánh giá |

### Knowledge
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/knowledge` | Danh sách tài liệu |
| POST | `/knowledge/upload` | Upload tài liệu (multipart) |
| DELETE | `/knowledge/:id` | Xóa tài liệu |
| POST | `/knowledge/:id/reindex` | Index lại tài liệu |

### Products
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/products` | Danh sách sản phẩm |
| POST | `/products` | Tạo sản phẩm (multipart + image) |
| PUT | `/products/:id` | Cập nhật sản phẩm |
| DELETE | `/products/:id` | Xóa sản phẩm |

### Departments
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/departments` | Danh sách phòng ban |
| PUT | `/departments/:id` | Cập nhật phòng ban |

### Admin
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/admin/dashboard` | Thống kê tổng quan |

### Audit
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/audit` | Danh sách audit log |

### Notifications
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/notifications` | Danh sách thông báo |
| PUT | `/notifications/read-all` | Đánh dấu đọc hết |

---

## Lỗi thường gặp & cách fix

### ❌ `MongoDB connection error: querySrv ENOTFOUND`
**Nguyên nhân:** File `.env` chưa được tạo hoặc bị lỗi encoding.

**Fix:**
```powershell
# Chạy trong thư mục backend/
"MONGODB_URI=mongodb+srv://..." | Set-Content .env -Encoding utf8
```

###  `Cannot find module './store/authStore'`
**Nguyên nhân:** File `src/store/authStore.js` bị thiếu.

**Fix:** File này có trong project. Đảm bảo giải nén đúng thư mục.

###  Vite lỗi import path
**Nguyên nhân:** Có thể xuất hiện folder tên `{auth,chat,...}` do lỗi `mkdir` brace expansion trên Linux.

**Fix:** Xóa các folder tên lạ đó đi, chúng là artifact lỗi, không cần thiết.

###  Đăng ký không hoạt động
**Nguyên nhân:** Backend chưa có route `/auth/register`.

**Fix:** Route đã được thêm vào file `backend/src/routes/auth.js` trong phiên bản này.

###  Upload ảnh sản phẩm không hoạt động
**Nguyên nhân:** Backend route `/products` cần hỗ trợ `multipart/form-data` với field `image`.

**Kiểm tra:** `backend/src/routes/products.js` phải dùng `multer` middleware.

### Chọn phòng ban khi upload tài liệu không hiện dropdown
**Nguyên nhân:** Logic cũ chỉ hiện dropdown với `master_admin` nhưng không fetch departments trước.

**Fix:** Đã sửa — dropdown hiện với `master_admin` và user chưa có phòng ban. Data departments được fetch khi mở trang.

###  Frontend chạy ở port khác (3000 thay vì 5173)
Kiểm tra `vite.config.js`, mặc định Vite dùng **5173**. Nếu thấy port 3000 là do đã config custom.

###  CORS error khi frontend gọi API
**Fix:** `backend/src/server.js` phải có:
```js
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }))
```

---

## Deploy với Docker

```bash
# Từ thư mục gốc TTTNCHATBOT/
docker-compose up --build
```

Cần tạo file `.env` ở thư mục gốc trước khi chạy Docker.

---

## Ghi chú

- **Auth system:** Dùng Zustand (`store/authStore.js`) làm single source of truth. `AuthContext` wrap lại Zustand để các component dùng `useAuth()` vẫn hoạt động bình thường.
- **Token storage:** Access token & refresh token lưu trong `localStorage` key `tttn-auth` (Zustand persist). Interceptor axios tự đọc và tự refresh khi nhận 401.
- **Seed data:** Chỉ chạy 1 lần khi database rỗng. Logic check `User.countDocuments() === 0`.
- **AI Service:** Là microservice độc lập, backend gọi qua HTTP. Nếu AI Service down, chat vẫn tạo được session nhưng không nhận được phản hồi AI.
#   c h a t b o t r a g 
 
 
