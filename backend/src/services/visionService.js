'use strict';
/**
 * backend/src/services/visionService.js
 *
 * Xử lý hình ảnh & tài liệu scan bằng OpenAI Vision (gpt-4o-mini):
 *  - ocrScannedPdf     : PDF là ảnh scan (không có text layer) → render từng trang → OCR
 *  - extractDocxImages : lấy ảnh nhúng trong .docx → mô tả/OCR từng ảnh
 *  - describeImageFile : tài liệu upload trực tiếp là 1 file ảnh (jpg/png...)
 *  - answerWithImage   : trả lời câu hỏi trong chat khi user đính kèm ảnh (multimodal)
 *
 * Mọi lỗi đều được nuốt (trả về '' hoặc mảng rỗng) để không làm sập pipeline chính —
 * OCR/vision là tính năng "tăng cường", không phải điều kiện bắt buộc để index tài liệu.
 */

const fs = require('fs');
const OpenAI = require('openai');

const VISION_MODEL = process.env.VISION_MODEL || 'gpt-4o-mini';
const MAX_OCR_PAGES = Number(process.env.MAX_OCR_PAGES || 20);
const MAX_DOCX_IMAGES = 10;

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function visionCall(base64, mimeType, prompt, maxTokens) {
  const res = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

// ── OCR toàn bộ ảnh trong 1 trang (dùng cho PDF scan) ─────────────────────
async function ocrImagePage(base64, mimeType = 'image/png') {
  return visionCall(
    base64,
    mimeType,
    'Trích xuất TOÀN BỘ nội dung chữ/số trong ảnh này, giữ nguyên cấu trúc bảng biểu nếu có (dùng | để phân cách cột). Chỉ trả về nội dung đã trích xuất, không thêm lời dẫn hay giải thích.',
    1500
  );
}

// ── Mô tả 1 ảnh (dùng cho ảnh nhúng trong docx, hoặc file ảnh độc lập) ────
async function describeImageBase64(base64, mimeType = 'image/png') {
  return visionCall(
    base64,
    mimeType,
    'Mô tả nội dung ảnh này bằng tiếng Việt. Nếu ảnh chứa chữ, số liệu, bảng biểu, biểu đồ — hãy trích xuất đầy đủ và chính xác. Nếu là ảnh minh hoạ thông thường, mô tả ngắn gọn nội dung chính.',
    600
  );
}

// Ảnh được upload làm TÀI LIỆU: chép lại đầy đủ nguyên văn (giữ đánh số mục, bảng, sơ đồ)
// thay vì chỉ mô tả sơ lược, để chatbot trả lời chính xác theo từng mục.
async function transcribeImageBase64(base64, mimeType = 'image/png') {
  return visionCall(
    base64,
    mimeType,
    'Đây là một tài liệu dạng ảnh. Hãy chép lại TOÀN BỘ nội dung chữ trong ảnh NGUYÊN VĂN, đúng thứ tự, giữ nguyên đánh số mục (1., 6.1, 6.2, a), b)...), tiêu đề, gạch đầu dòng và bảng biểu (dùng | phân cách cột). Nếu có sơ đồ/luồng xử lý, mô tả các khối và mũi tên theo thứ tự. Sau đó thêm 1-2 câu tóm tắt ảnh nói về chủ đề gì. Không bỏ sót, không thêm ý ngoài ảnh.',
    3000
  );
}

async function describeImageFile(filePath, mimeType) {
  try {
    const base64 = fs.readFileSync(filePath).toString('base64');
    return await transcribeImageBase64(base64, mimeType || guessMime(filePath));
  } catch (e) {
    console.warn('[Vision] describeImageFile lỗi:', e.message);
    return '';
  }
}

function guessMime(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
}

// ── OCR toàn bộ PDF scan: render từng trang thành ảnh rồi OCR ─────────────
// Cần package "pdf2pic" (dựa trên GraphicsMagick/ImageMagick + Ghostscript đã cài ở hệ thống).
async function ocrScannedPdf(filePath, pageCount) {
  let fromPath;
  try {
    ({ fromPath } = require('pdf2pic'));
  } catch {
    console.warn('[Vision] Thiếu package "pdf2pic" — bỏ qua OCR PDF scan. Chạy: npm install pdf2pic');
    return '';
  }

  const os = require('os');
  const limit = Math.min(pageCount || MAX_OCR_PAGES, MAX_OCR_PAGES);
  const convert = fromPath(filePath, {
    density: 150,
    format: 'png',
    width: 1400,
    height: 1800,
    saveFilename: `ocr_${Date.now()}`,
    savePath: os.tmpdir(),
  });

  const pages = [];
  for (let i = 1; i <= limit; i++) {
    let page;
    try {
      page = await convert(i, { responseType: 'base64' });
    } catch {
      break; // hết trang
    }
    if (!page?.base64) break;
    try {
      const text = await ocrImagePage(page.base64, 'image/png');
      if (text) pages.push(`--- Trang ${i} ---\n${text}`);
    } catch (e) {
      console.warn(`[Vision] OCR trang ${i} lỗi:`, e.message);
    } finally {
      if (page.path && fs.existsSync(page.path)) fs.unlink(page.path, () => {});
    }
  }
  return pages.join('\n\n');
}

// ── Lấy caption cho ảnh nhúng trong file .docx ────────────────────────────
async function extractDocxImages(filePath) {
  let mammoth;
  try { mammoth = require('mammoth'); } catch { return []; }

  const images = [];
  try {
    await mammoth.convertToHtml(
      { path: filePath },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (images.length >= MAX_DOCX_IMAGES) return { src: '' };
          const base64 = await image.read('base64');
          images.push({ base64, contentType: image.contentType || 'image/png' });
          return { src: '' };
        }),
      }
    );
  } catch (e) {
    console.warn('[Vision] extractDocxImages lỗi:', e.message);
    return [];
  }

  const captions = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const caption = await describeImageBase64(images[i].base64, images[i].contentType);
      if (caption) captions.push(`[Ảnh ${i + 1} trong tài liệu]: ${caption}`);
    } catch { /* bỏ qua ảnh lỗi */ }
  }
  return captions;
}

// ── Trả lời multimodal trong chat khi user đính kèm ảnh ───────────────────
async function answerWithImage({ base64, mimeType, question, systemPrompt, contextText, history }) {
  const messages = [{
    role: 'system',
    content: `${systemPrompt || 'Bạn là trợ lý AI nội bộ, trả lời bằng tiếng Việt.'}${
      contextText ? `\n\nTài liệu nội bộ liên quan:\n${contextText}` : ''
    }\n\nNgười dùng vừa đính kèm 1 ảnh. Hãy phân tích ảnh và trả lời dựa trên nội dung ảnh kết hợp tài liệu nội bộ (nếu liên quan).`,
  }];
  (history || []).slice(-4).forEach((m) => {
    if (['user', 'assistant'].includes(m.role)) messages.push({ role: m.role, content: m.content });
  });
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: question?.trim() || 'Hãy phân tích ảnh này.' },
      { type: 'image_url', image_url: { url: `data:${mimeType || 'image/png'};base64,${base64}` } },
    ],
  });

  const res = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.2,
    max_tokens: 1000,
    messages,
  });
  return {
    content: res.choices?.[0]?.message?.content || '',
    tokens: res.usage?.total_tokens || 0,
  };
}

module.exports = {
  ocrScannedPdf,
  extractDocxImages,
  describeImageFile,
  describeImageBase64,
  answerWithImage,
  guessMime,
};
