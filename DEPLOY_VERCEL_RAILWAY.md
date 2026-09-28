# Deploy len Vercel + Railway

Tai lieu nay huong dan deploy theo kieu:
- Frontend (Vite/React) -> Vercel
- Backend (Node/Express) -> Railway
- ChromaDB -> Railway
- AI Service (FastAPI) -> Railway (tuy chon)

## 1. Deploy Backend len Railway

1. Vao Railway -> New Project -> Deploy from GitHub repo nay.
2. Tao service moi tu monorepo va chon Root Directory la `backend`.
3. Railway se build bang `backend/Dockerfile` (khong can doi).
4. Dat cac bien moi truong cho service backend:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `OPENAI_API_KEY`
- `CHROMA_URL` (URL private cua service ChromaDB, vi du `http://chromadb.railway.internal:8000`)
- `CORS_ORIGIN` (URL frontend Vercel, vi du `https://ten-app.vercel.app`)
- `NODE_ENV=production`
- `PORT=5000`

5. Mo public networking cho backend service de lay domain `https://...up.railway.app`.
6. Test endpoint:

`GET /health`

Neu backend chay dung, endpoint se tra ve status ok.

## 2. Deploy ChromaDB len Railway

1. Tao service moi trong cung Railway project.
2. Chon image: `chromadb/chroma:latest`.
3. Dat env:

- `IS_PERSISTENT=TRUE`
- `ALLOW_RESET=TRUE`

4. Gan volume cho duong dan `/chroma/chroma` de du lieu khong mat khi redeploy.
5. Dung private network URL cua service nay cho bien `CHROMA_URL` ben backend.

## 3. Deploy AI Service len Railway (tuy chon)

Luu y: Backend hien tai dang tu ket noi Chroma/OpenAI truc tiep, khong bat buoc phai goi AI Service de chat hoat dong.

Neu ban van muon deploy:
1. Tao service moi, Root Directory: `ai-service`.
2. Dat env:

- `OPENAI_API_KEY`
- `MONGODB_URI`
- `CHROMA_HOST` (host private cua ChromaDB)
- `CHROMA_PORT=8000`

3. Public networking neu muon goi tu ngoai.
4. Test endpoint `GET /api/health`.

## 4. Deploy Frontend len Vercel

1. Vao Vercel -> Add New Project -> import repo nay.
2. Chon Root Directory la `frontend`.
3. Build settings:

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

4. Dat env cho Vercel:

- `VITE_API_URL=https://<backend-domain>.up.railway.app/api`

5. Deploy.

File `frontend/vercel.json` da duoc them rewrite ve `index.html` de React Router hoat dong dung khi F5.

## 5. Kiem tra sau deploy

1. Dang ky / dang nhap tren frontend.
2. CRUD san pham + upload anh.
3. Upload tai lieu knowledge.
4. Tao chat session va gui cau hoi.

Neu chat bao loi AI, kiem tra:
- `OPENAI_API_KEY`
- `CHROMA_URL`
- ChromaDB service co dang running khong.
