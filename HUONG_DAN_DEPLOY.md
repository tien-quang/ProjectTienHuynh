# 🚀 HƯỚNG DẪN DEPLOY CHATBOT RAG LÊN RAILWAY & VERCEL

## 📋 MỤC LỤC
1. [Deploy Backend lên Railway](#deploy-backend-railway)
2. [Deploy Frontend lên Vercel](#deploy-frontend-vercel)
3. [Kết nối Frontend với Backend](#kết-nối-frontend-backend)
4. [Troubleshooting](#troubleshooting)

---

## ⚙️ DEPLOY BACKEND LÊN RAILWAY

### Bước 1: Tạo tài khoản Railway
1. Vào https://railway.app
2. Click **Sign Up** → Chọn **GitHub**
3. Xác thực tài khoản GitHub
4. Hoàn thành xác minh email

### Bước 2: Tạo Project mới trên Railway
1. Trong Dashboard, click **New Project**
2. Chọn **Deploy from GitHub repo**
3. Kết nối tài khoản GitHub
4. Chọn repository **tien-quang/chatbotrag**

### Bước 3: Cấu hình Backend
1. Railway tự động phát hiện `Dockerfile` và `package.json`
2. Nó sẽ tạo một service cho backend
3. Chờ build hoàn thành (5-10 phút)

### Bước 4: Set biến môi trường (Environment Variables)
1. Trong Railway Dashboard, click vào **Backend Service**
2. Vào tab **Variables**
3. Thêm các biến sau:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/tttnchatbot?retryWrites=true&w=majority
JWT_SECRET=your_secret_key_here
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=your_openai_key_here
NODE_ENV=production
PORT=5000
```

**⚠️ Lưu ý quan trọng:**
- Dùng MongoDB Atlas: https://www.mongodb.com/cloud/atlas
- Dùng OpenAI API Key từ: https://platform.openai.com/api-keys
- Tạo JWT_SECRET mạnh (ít nhất 32 ký tự ngẫu nhiên)

### Bước 5: Lấy URL Backend
1. Trong Railway, vào **Deployments**
2. Nhìn domain được sinh ra, ví dụ: `https://chatbotrag-production.up.railway.app`
3. **Lưu URL này** - sẽ dùng cho Frontend

### Bước 6: Kiểm tra Backend
- Truy cập: `https://your-domain/api/health` (nếu có endpoint này)
- Hoặc kiểm tra logs: Xem tab **Logs** trong Railway

---

## 🎨 DEPLOY FRONTEND LÊN VERCEL

### Bước 1: Tạo tài khoản Vercel
1. Vào https://vercel.com
2. Click **Sign Up** → Chọn **GitHub**
3. Xác thực GitHub

### Bước 2: Deploy từ GitHub
1. Trong Vercel Dashboard, click **Add New...**
2. Chọn **Project**
3. Click **Import Git Repository**
4. Chọn repository `tien-quang/chatbotrag`

### Bước 3: Configure Project
1. **Framework Preset**: Chọn **Vite** (nó sẽ tự nhận biết)
2. **Root Directory**: Đặt thành `frontend/`
3. Click **Continue**

### Bước 4: Set Environment Variables
1. Vercel sẽ hiện trang **Configure Project**
2. Scroll xuống **Environment Variables**
3. Thêm biến:

```
VITE_BACKEND_URL=https://your-railway-backend-url (vd: https://chatbotrag-production.up.railway.app)
```

**Ví dụ:**
```
VITE_BACKEND_URL=https://chatbotrag-production.up.railway.app
```

### Bước 5: Deploy
1. Click **Deploy**
2. Chờ 2-3 phút
3. Vercel sẽ tự động deploy khi hoàn thành
4. Bạn sẽ nhận URL: `https://chatbotrag.vercel.app`

---

## 🔗 KẾT NỐI FRONTEND VỚI BACKEND

### Cách 1: Qua Environment Variable (Đã làm ở trên)

**File: `frontend/src/services/api.js`**

```javascript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});
```

### Cách 2: Nếu chưa có trong code
1. Mở `frontend/src/services/api.js`
2. Tìm dòng `baseURL:`
3. Thay bằng:

```javascript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});
```

4. Commit & push lên GitHub
5. Vercel sẽ tự động redeploy

### Cách 3: Update Environment Variable trên Vercel (Nếu URL thay đổi)
1. Vào Vercel Dashboard
2. Click vào Project **chatbotrag**
3. Vào **Settings** → **Environment Variables**
4. Tìm `VITE_BACKEND_URL`
5. Cập nhật URL mới
6. Vercel sẽ trigger rebuild tự động

---

## ✅ KIỂM TRA DEPLOYMENT

### Kiểm tra Backend (Railway)
```bash
# Mở terminal, test API
curl https://your-railway-url/api/health

# Hoặc kiểm tra trong Railway Dashboard
# Click Service → Logs
```

### Kiểm tra Frontend (Vercel)
```bash
# Truy cập URL Vercel
https://chatbotrag.vercel.app

# Mở DevTools (F12)
# Kiểm tra Network → Requests được gửi tới backend URL
```

### Kiểm tra kết nối
1. Mở frontend: https://chatbotrag.vercel.app
2. F12 → Console
3. Nếu không có lỗi CORS = backend kết nối OK ✓

---

## 🚨 TROUBLESHOOTING

### Lỗi 1: CORS Error
**Lỗi:** `Access to XMLHttpRequest blocked by CORS policy`

**Giải pháp:**
1. Mở `backend/src/server.js`
2. Tìm CORS config:

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'https://chatbotrag.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true
}));
```

3. Commit, push, Railway sẽ tự rebuild

### Lỗi 2: 404 Not Found
**Nguyên nhân:** Frontend không kết nối được backend

**Giải pháp:**
1. Kiểm tra `VITE_BACKEND_URL` trong Vercel
2. Chắc chắn URL không có `/api` ở cuối
3. Reload Vercel project (Settings → Git → Redeploy)

### Lỗi 3: Backend không khởi động
**Kiểm tra:**
1. Vào Railway Dashboard
2. Click Service → **Logs** (xem lỗi)
3. Kiểm tra biến môi trường
4. Kiểm tra connection string MongoDB

**Thường do:**
- MongoDB connection string sai
- Missing environment variables
- Port không khớp

### Lỗi 4: Timeout 504
**Lỗi:** Gateway Timeout

**Giải pháp:**
1. Backend có thể chậm lần đầu
2. Railway sẽ tự restart
3. Chờ 5-10 phút, thử lại

---

## 📱 DOMAIN TÙY CHỈNH (Optional)

### Railway - Thêm Custom Domain
1. Vào Railway → Project → Settings
2. Tìm **Custom Domain**
3. Nhập domain của bạn
4. Cấu hình DNS theo hướng dẫn

### Vercel - Thêm Custom Domain
1. Vào Vercel → Project Settings → Domains
2. Thêm domain
3. Cấu hình DNS

---

## 📞 CẦN GIÚP?

- **Railway Docs:** https://docs.railway.app
- **Vercel Docs:** https://vercel.com/docs
- **MongoDB Atlas:** https://docs.atlas.mongodb.com

---

## 🔐 BẢO MẬT QUAN TRỌNG

✅ **Đã làm:**
- .env không được commit (.gitignore đã cấu hình)
- Sử dụng environment variables trên Railway & Vercel

✅ **Tiếp tục làm:**
- Không bao giờ share secret key công khai
- Dùng strong password cho MongoDB
- Enable 2FA trên Railway & Vercel
- Thay đổi JWT_SECRET định kỳ

---

## 🎉 HOÀN THÀNH!

Nếu tất cả bước trên thành công:
- ✅ Backend chạy trên Railway
- ✅ Frontend chạy trên Vercel
- ✅ Frontend kết nối được Backend
- ✅ Ứng dụng sẵn sàng dùng!

**Live links:**
- Frontend: https://chatbotrag.vercel.app
- Backend: https://your-railway-url
