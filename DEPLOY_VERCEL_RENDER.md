# Deploy Vercel + Render

## 1. Bao mat truoc khi deploy

Khong commit `backend/.env`. File nay da duoc ignore boi `.gitignore`.

Neu cac secret trong file local da tung duoc push hoac chia se, hay rotate ngay MongoDB password va OpenAI API key truoc khi deploy.

Trong MongoDB Atlas, vao **Network Access** va cho phep Render truy cap. Cach nhanh la them `0.0.0.0/0`; neu can bao mat cao hon, dung outbound IP cua Render.

## 2. Deploy backend len Render

1. Vao Render -> **New** -> **Web Service** -> chon repository GitHub.
2. Dat **Root Directory** la `backend`.
3. Chon runtime **Docker**. Render se dung `backend/Dockerfile`.
4. Dat **Health Check Path** la `/health`.
5. Tao cac environment variables:

```text
MONGODB_URI=<MongoDB Atlas URI>
JWT_SECRET=<secret dai, ngau nhien>
JWT_REFRESH_SECRET=<secret dai, ngau nhien>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=<OpenAI key moi>
CHROMA_URL=<URL Chroma Cloud hoac Chroma server>
CORS_ORIGIN=https://<ten-app>.vercel.app
NODE_ENV=production
```

Khong can dat `PORT`; Render tu cap bien `PORT` va backend da su dung bien do.

Sau khi deploy, copy domain dang `https://<ten-backend>.onrender.com` va kiem tra:

```text
https://<ten-backend>.onrender.com/health
```

Ket qua dung co `status: "ok"`.

## 3. ChromaDB

Backend dung Chroma truc tiep cho RAG. Render Free khong phu hop de chay ChromaDB co du lieu lau dai vi filesystem co the mat khi redeploy. Dung Chroma Cloud hoac mot Chroma server co persistent disk, sau do dat URL vao `CHROMA_URL` tren Render.

## 4. Deploy frontend len Vercel

1. Vao Vercel -> **Add New Project** -> import cung repository.
2. Dat **Root Directory** la `frontend`.
3. Framework Preset: **Vite**.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Them environment variable:

```text
VITE_BACKEND_URL=https://<ten-backend>.onrender.com
```

7. Deploy frontend, copy URL Vercel va cap nhat lai `CORS_ORIGIN` tren Render bang dung URL do, khong co dau `/` cuoi.

## 5. Deploy bang Blueprint

Repository da co `render.yaml`. Tren Render chon **New -> Blueprint**, chon repository va xac nhan service backend. Nhap thu cong `MONGODB_URI`, `OPENAI_API_KEY`, `CHROMA_URL`, va `CORS_ORIGIN` trong Render Dashboard.

## 6. Kiem tra

- Mo `/health` cua Render.
- Mo frontend Vercel, dang ky/dang nhap.
- Kiem tra CRUD san pham va upload tai lieu.
- Neu CORS loi, kiem tra `CORS_ORIGIN`.
- Neu chat AI loi, kiem tra `OPENAI_API_KEY` va `CHROMA_URL`.
- File upload tren Render co the mat khi service redeploy; neu can luu lau dai, chuyen upload sang object storage.
