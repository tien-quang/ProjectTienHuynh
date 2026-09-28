FROM node:20

# pdf2pic (dùng để OCR PDF scan qua Vision) cần GraphicsMagick + Ghostscript
RUN apt-get update && apt-get install -y --no-install-recommends \
    graphicsmagick ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["node", "src/server.js"]
