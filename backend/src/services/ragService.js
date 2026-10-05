'use strict';
/**
 * backend/src/services/ragService.js
 *
 * LangGraph Multi-Agent RAG Pipeline — v3 (strict grounding + tiết kiệm token)
 * ───────────────────────────────────────────────────────────────────────────
 * Graph 1 — CHAT:
 *   START → memory ─┬─(chitchat)──→ chitchat → END
 *                   ├─(offtopic)──→ off_topic → END        (KHÔNG tốn thêm token)
 *                   └─(lookup)────→ router → [doc_agent | product_agent | both_agent]
 *         → rerank(hybrid) → expand → self_critique ─┬─(chưa đủ)──→ router (tối đa N lần)
 *                                                     ├─(mơ hồ)────→ ask_clarify → END
 *                                                     ├─(không có)─→ no_info → END   (KHÔNG gọi generate)
 *                                                     └─(đủ)───────→ generate → END
 *
 * Graph 2 — INDEX: extract(+vision) → chunk → embed → version_check → save_chroma → update_mongo
 * Graph 3 — PRODUCT: build_text → embed → upsert
 *
 * Thay đổi so với v2 (giữ nguyên toàn bộ chức năng cũ):
 *  ✓ Chặn trả lời khi tài liệu không có thông tin:
 *      - ngưỡng khoảng cách vector chặt hơn (RAG_DOC_DIST / RAG_PROD_DIST, chỉnh được bằng .env)
 *      - câu hỏi ngoài phạm vi (viết code, kiến thức chung...) bị chặn ngay ở bước memory
 *      - không có chunk nào đạt ngưỡng → trả "không tìm thấy" luôn, KHÔNG gọi LLM generate
 *      - prompt generate cấm dùng kiến thức bên ngoài; không có thông tin → model trả [NO_INFO]
 *        → hệ thống đổi thành thông báo chuẩn và KHÔNG hiển thị nguồn
 *  ✓ Chống bịa: temperature 0, ép trích đúng số liệu/tên trong tài liệu
 *  ✓ Tiết kiệm token:
 *      - gộp phân loại router vào lời gọi memory (bỏ 1 lần gọi LLM mỗi câu hỏi)
 *      - câu hỏi ngoài phạm vi / không có dữ liệu → dừng sớm
 *      - chỉ gửi lịch sử hội thoại vào generate khi câu hỏi thật sự là câu tiếp nối
 *      - retry tự phản biện chỉ chạy khi đã có chunk nhưng chưa đủ
 */

const fs   = require('fs');
const path = require('path');
const { ChromaClient }  = require('chromadb');
const OpenAI            = require('openai');
const { StateGraph, END, START, Annotation } = require('@langchain/langgraph');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const Department        = require('../models/Department');
const visionService     = require('./visionService');

// ── Config ────────────────────────────────────────────────────────────
const CHUNK_SIZE    = 800;
const CHUNK_OVERLAP = 150;
const TOP_K         = 6;
// Khoảng cách vector (Chroma mặc định L2 bình phương, embedding đã chuẩn hoá: 0 = giống hệt, ~2 = không liên quan).
// Cũ là 1.9/2.0 (gần như chunk nào cũng lọt qua → model trả lời bừa). Nếu bạn thấy bot từ chối nhầm
// câu hỏi đúng thì tăng nhẹ qua .env (RAG_DOC_DIST=1.3); nếu vẫn trả lời bừa thì giảm (RAG_DOC_DIST=1.1).
const DOC_DIST      = Number(process.env.RAG_DOC_DIST)  || 1.2;
const PROD_DIST     = Number(process.env.RAG_PROD_DIST) || 1.2;
const FOCUS_DIST    = DOC_DIST + 0.2;   // ngưỡng khi tìm trong tài liệu vừa dùng ở lượt trước (câu hỏi tiếp nối)
const WEAK_DIST     = 0.8;              // match yếu hơn mức này → cho LLM rerank được quyền loại bỏ hết
const MIN_CHARS_PER_PAGE      = 40;   // dưới ngưỡng này → coi PDF là bản scan
const MAX_SELF_CRITIQUE_RETRY = 2;    // số lần agent tự tìm lại trước khi dừng
const SUPERSEDE_DIST          = 0.35; // càng nhỏ càng "cùng một chủ đề/nội dung"
const COMPARE_DIST            = 0.9;  // ngưỡng lỏng hơn dùng khi so sánh thủ công trong chat
const SUMMARY_TRIGGER         = 24;   // số message bắt đầu tóm tắt bớt lịch sử
const SUMMARY_KEEP_RECENT     = 10;
const CHAT_MODEL              = process.env.CHAT_MODEL || 'gpt-4o-mini'; // model cho rewrite/critique/generate
const FULL_DOC_MAX_CHARS      = 20000; // trần ký tự khi nạp trọn 1 tài liệu (câu hỏi đếm/liệt kê/theo số mục)

// ── Thông báo chuẩn & cờ [NO_INFO] ────────────────────────────────────
const NO_INFO_TAG = '[NO_INFO]';
const NO_INFO_MSG = 'Tôi chưa tìm thấy thông tin này trong tài liệu nội bộ đã được tải lên. Bạn có thể hỏi cụ thể hơn, hoặc kiểm tra xem tài liệu liên quan đã được tải lên hệ thống chưa.';
const OFF_TOPIC_MSG = 'Tôi chỉ hỗ trợ trả lời dựa trên tài liệu nội bộ và dữ liệu sản phẩm đã được tải lên hệ thống. Câu hỏi này nằm ngoài phạm vi đó nên tôi không trả lời. Bạn thử hỏi về nội dung trong tài liệu nhé!';
const isNoInfo = (s) => (s || '').trim().startsWith(NO_INFO_TAG);

// ── Singletons ────────────────────────────────────────────────────────
let _chroma = null;
let _openai = null;
const getChroma = () => {
  if (!_chroma) _chroma = new ChromaClient({ path: process.env.CHROMA_URL || 'http://localhost:8000' });
  return _chroma;
};
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
};
const toColName = (code) => `tttn_${code.toLowerCase()}_docs`;

// ══════════════════════════════════════════════════════════════════════
// BASE HELPERS
// ══════════════════════════════════════════════════════════════════════

async function extractPdfText(filePath) {
  const buf = fs.readFileSync(filePath);
  const parsed = await require('pdf-parse')(buf);
  const numPages = parsed.numpages || 1;
  const density  = (parsed.text || '').trim().length / numPages;

  if (density >= MIN_CHARS_PER_PAGE) return parsed.text;

  console.log(`[RAG] PDF có vẻ là bản scan (~${density.toFixed(0)} ký tự/trang) → chạy Vision OCR`);
  try {
    const ocrText = await visionService.ocrScannedPdf(filePath, numPages);
    if (ocrText && ocrText.trim().length > (parsed.text || '').trim().length) return ocrText;
    return parsed.text;
  } catch (e) {
    console.warn('[RAG] OCR fallback lỗi, dùng text gốc từ pdf-parse:', e.message);
    return parsed.text;
  }
}

async function extractText(filePath, fileType) {
  const ext = (fileType || path.extname(filePath).slice(1)).toLowerCase();

  if (ext === 'pdf') return extractPdfText(filePath);

  if (ext === 'docx') {
    const raw = (await require('mammoth').extractRawText({ path: filePath })).value;
    let imageCaptions = [];
    try { imageCaptions = await visionService.extractDocxImages(filePath); } catch { /* bỏ qua */ }
    return imageCaptions.length ? `${raw}\n\n${imageCaptions.join('\n')}` : raw;
  }

  if (['xlsx', 'xls'].includes(ext)) {
    const XLSX = require('xlsx');
    const wb   = XLSX.readFile(filePath);
    return wb.SheetNames.map(s => `Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n');
  }

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return visionService.describeImageFile(filePath, visionService.guessMime(filePath));
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const bp = Math.max(text.lastIndexOf('.', end), text.lastIndexOf('\n', end));
      if (bp > start + size * 0.5) end = bp + 1;
    }
    const c = text.slice(start, end).trim();
    if (c.length > 50) chunks.push(c);
    start = end - overlap;
  }
  return chunks;
}

async function embedTexts(texts) {
  const all = [];
  for (let i = 0; i < texts.length; i += 50) {
    const res = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.slice(i, i + 50),
    });
    all.push(...res.data.map(d => d.embedding));
  }
  return all;
}

async function llm(messages, opts = {}) {
  const res = await getOpenAI().chat.completions.create({
    model:       opts.model ?? CHAT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens:  opts.maxTokens  ?? 1200,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  });
  return {
    content: res.choices[0].message.content,
    tokens:  res.usage?.total_tokens || 0,
  };
}

// Lọc bỏ các chunk thuộc tài liệu đã bị archive (isActive:false, tức đã bị tài liệu mới thay thế)
async function filterActiveChunks(chunks) {
  const docChunks = chunks.filter(c => !c.isProd && c.docId);
  if (!docChunks.length) return chunks;
  const docIds = [...new Set(docChunks.map(c => c.docId))];
  try {
    const inactiveDocs = await KnowledgeDocument.find({ _id: { $in: docIds }, isActive: false }).select('_id').lean();
    if (!inactiveDocs.length) return chunks;
    const inactiveIds = new Set(inactiveDocs.map(d => d._id.toString()));
    return chunks.filter(c => c.isProd || !inactiveIds.has(c.docId));
  } catch {
    return chunks; // lỗi Mongo → không chặn pipeline, cứ trả nguyên
  }
}

function keywordScore(text, query) {
  const qWords = [...new Set((query || '').toLowerCase().split(/\s+/).filter(w => w.length > 2))];
  if (!qWords.length) return 0;
  const t = text.toLowerCase();
  let hit = 0;
  qWords.forEach(w => { if (t.includes(w)) hit++; });
  return hit / qWords.length;
}

// ══════════════════════════════════════════════════════════════════════
// GRAPH 1 — CHAT GRAPH (Multi-Agent + Self-Critique Loop + Strict Grounding)
// ══════════════════════════════════════════════════════════════════════

const ChatState = Annotation.Root({
  question:            Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  deptCode:            Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  deptName:            Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  systemPrompt:        Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  history:             Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  conversationSummary: Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  isAdmin:             Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  expandedQ:           Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  queryType:           Annotation({ reducer: (_, b) => b ?? _, default: () => 'doc' }),
  typeResolved:        Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  qVec:                Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  chunks:              Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  hasCtx:              Annotation({ reducer: (_, b) => b ?? _, default: () => true }),
  retryCount:          Annotation({ reducer: (_, b) => b ?? _, default: () => 0 }),
  clarify:             Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  noInfo:              Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  followUp:            Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  intent:              Annotation({ reducer: (_, b) => b ?? _, default: () => 'lookup' }),
  needFullDoc:         Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  focusDocIds:         Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  answer:              Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  sources:             Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  tokens:              Annotation({ reducer: (_, b) => b ?? _, default: () => 0 }),
});

// ── Helpers ngữ cảnh hội thoại ────────────────────────────────────────
function recentTurns(history, n = 6) {
  return (history || []).slice(-n).map(m => ({
    role: m.role,
    text: (m.content || '').slice(0, m.role === 'user' ? 400 : 600),
  }));
}

// Tài liệu mà AI đã dùng ở 1-2 lượt trả lời gần nhất (để câu hỏi tiếp nối bám đúng tài liệu đó)
function lastSourceDocs(history) {
  const docs = [];
  let seenAssistant = 0;
  for (let i = (history || []).length - 1; i >= 0 && seenAssistant < 2; i--) {
    const m = history[i];
    if (m.role !== 'assistant') continue;
    seenAssistant++;
    (m.sources || []).forEach(s => {
      if (!s.isProduct && s.documentId && !docs.some(d => d.documentId === s.documentId)) docs.push(s);
    });
  }
  return docs;
}

// ── Node: Memory — hiểu câu hỏi trong ngữ cảnh + phân loại ý định + loại câu hỏi ──
// Một lời gọi LLM duy nhất (đã gộp luôn bước phân loại router để tiết kiệm token):
// câu mới có liên quan lượt trước không, viết lại độc lập, ý định (xã giao / ngoài phạm vi / tra cứu),
// loại dữ liệu cần tra (doc/product/both), có cần đọc trọn tài liệu không.
async function nodeMemory(state) {
  const history = state.history || [];
  const q       = state.question.trim();
  const turns   = recentTurns(history);
  const prevDocs = lastSourceDocs(history);

  const ctxBlock = [
    state.conversationSummary ? `Tóm tắt phần hội thoại cũ:\n${state.conversationSummary}` : '',
    turns.length ? `Các lượt gần nhất:\n${turns.map(t => `${t.role === 'user' ? 'Người dùng' : 'AI'}: ${t.text}`).join('\n')}` : '',
    prevDocs.length ? `Tài liệu AI vừa dùng để trả lời: ${prevDocs.map(d => d.documentName).join(', ')}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const { content } = await llm([{
      role: 'user',
      content: `${ctxBlock ? ctxBlock + '\n\n' : ''}Câu hỏi mới của người dùng: "${q}"

Bạn là bộ phân loại cho chatbot CHỈ trả lời dựa trên tài liệu nội bộ và dữ liệu sản phẩm của công ty. Trả JSON:
{
 "related": true|false,
 "standalone": "...",
 "intent": "chitchat"|"offtopic"|"lookup",
 "type": "doc"|"product"|"both",
 "needFullDoc": true|false
}
- related: câu mới có tiếp nối/liên quan chủ đề các lượt trước không.
- standalone: câu hỏi viết lại ĐỘC LẬP, đủ chủ thể/đối tượng, tiếng Việt. Nếu related=true: bổ sung chủ đề/tài liệu/mục đang nói từ các lượt trước (giải quyết các từ như "nó", "mục đó", "còn cái kia", "6.1-6.5"). Nếu related=false: giữ nguyên ý câu hỏi, TUYỆT ĐỐI không chèn chủ đề cũ.
- intent:
   "chitchat": chỉ chào hỏi/cảm ơn/tạm biệt/hỏi về chính chatbot.
   "offtopic": nhờ AI làm việc chung KHÔNG liên quan tài liệu/sản phẩm nội bộ (viết code mẫu, giải toán, dịch thuật, viết văn, kiến thức phổ thông, tin tức, chứng khoán, thời tiết...). Nếu câu hỏi có thể là về nội dung tài liệu nội bộ (nhắc "trong tài liệu", tên file, quy định/chính sách/quy trình/đề tài của công ty) thì KHÔNG phải offtopic.
   "lookup": mọi trường hợp còn lại (hỏi nội dung tài liệu hoặc sản phẩm).
- type (chỉ cần khi lookup): "product" nếu hỏi về sản phẩm/giá/tồn kho; "both" nếu cần cả tài liệu lẫn sản phẩm; "doc" cho còn lại.
- needFullDoc: true nếu cần xem trọn tài liệu để trả lời đúng: đếm số lượng, liệt kê tất cả mục/bước, tóm tắt toàn bộ, hoặc hỏi theo số mục/chương (vd 6.1, mục 3).`,
    }], { temperature: 0, maxTokens: 300, json: true });

    const p = JSON.parse(content);
    const related    = p.related === true && turns.length > 0;
    const standalone = (p.standalone || '').trim() || q;
    // câu tiếp nối thì không bao giờ coi là offtopic (vd "còn cái kia?")
    const intent = p.intent === 'chitchat' ? 'chitchat'
                 : (p.intent === 'offtopic' && !related) ? 'offtopic'
                 : 'lookup';
    const queryType = ['doc', 'product', 'both'].includes(p.type) ? p.type : 'doc';
    console.log(`[Memory] related=${related} intent=${intent} type=${queryType} fullDoc=${p.needFullDoc} | "${q}" → "${standalone}"`);
    return {
      expandedQ:    standalone,
      followUp:     related,
      intent,
      queryType,
      typeResolved: true,
      needFullDoc:  p.needFullDoc === true,
      focusDocIds:  related ? prevDocs.map(d => d.documentId) : [],
    };
  } catch (e) {
    console.warn('[Memory] lỗi, dùng câu hỏi gốc:', e.message);
    return { expandedQ: q, followUp: false, intent: 'lookup', typeResolved: false, needFullDoc: false, focusDocIds: [] };
  }
}

function routeAfterMemory(state) {
  if (state.intent === 'chitchat') return 'chitchat';
  if (state.intent === 'offtopic') return 'off_topic';
  return 'router';
}

// ── Node: Chitchat — xã giao, không tra tài liệu ────────────────────────
async function nodeChitchat(state) {
  const messages = [{
    role: 'system',
    content: `${state.systemPrompt || 'Bạn là trợ lý AI nội bộ của công ty, trả lời bằng tiếng Việt.'}\nĐây là câu xã giao/hỏi về trợ lý: trả lời ngắn gọn (1-2 câu), thân thiện, không tra cứu tài liệu. Bạn chỉ hỗ trợ giải đáp dựa trên tài liệu nội bộ và dữ liệu sản phẩm; tuyệt đối không đưa ra thông tin/kiến thức ngoài phạm vi đó. Nếu người dùng cần thông tin nghiệp vụ, mời họ nêu rõ câu hỏi.`,
  }];
  recentTurns(state.history, 2).forEach(t => messages.push({ role: t.role, content: t.text }));
  messages.push({ role: 'user', content: state.question });
  const { content, tokens } = await llm(messages, { temperature: 0.3, maxTokens: 150 });
  return { answer: content, sources: [], tokens };
}

// ── Node: Off-topic — câu hỏi ngoài phạm vi, từ chối ngay (không tốn thêm token) ──
function nodeOffTopic() {
  console.log('[OffTopic] chặn câu hỏi ngoài phạm vi tài liệu');
  return { answer: OFF_TOPIC_MSG, sources: [], tokens: 0 };
}

// ── Node: No Info — không có dữ liệu liên quan, trả lời chuẩn (không gọi generate) ──
function nodeNoInfo() {
  console.log('[NoInfo] không có chunk đạt ngưỡng → không gọi generate');
  return { answer: NO_INFO_MSG, sources: [], tokens: 0 };
}

// ── Node: Router ─────────────────────────────────────────────────────
// Loại câu hỏi đã được nodeMemory phân loại sẵn → không gọi LLM nữa.
// Chỉ gọi LLM khi memory lỗi (typeResolved=false).
async function nodeRouter(state) {
  const q = state.expandedQ || state.question;
  if (state.typeResolved) {
    return { queryType: state.queryType || 'doc', expandedQ: q };
  }
  try {
    const { content } = await llm([{
      role: 'user',
      content: `Phân loại câu hỏi: "${q}"\n→ "product" nếu hỏi về sản phẩm/giá/kho\n→ "both" nếu cần cả tài liệu lẫn sản phẩm\n→ "doc" cho mọi trường hợp còn lại\nJSON: {"type":"doc"|"product"|"both"}`,
    }], { temperature: 0, maxTokens: 40, json: true });
    const t = JSON.parse(content).type;
    const queryType = ['doc', 'product', 'both'].includes(t) ? t : 'doc';
    console.log(`[Router] type=${queryType} q="${q.slice(0, 50)}"`);
    return { queryType, expandedQ: q };
  } catch {
    return { queryType: 'doc', expandedQ: q };
  }
}

// ── Helper: query 1 collection ChromaDB (có thể giới hạn theo where) ────────
async function queryCollection(name, vec, dist, topK, where) {
  try {
    const chroma = getChroma();
    const col    = await chroma.getCollection({ name });
    const count  = await col.count();
    if (count === 0) return [];

    const res = await col.query({
      queryEmbeddings: [vec],
      nResults:        Math.min(topK, count),
      include:         ['documents', 'metadatas', 'distances'],
      ...(where ? { where } : {}),
    });

    return (res.documents?.[0] || []).map((doc, i) => ({
      text:     doc,
      docId:    res.metadatas[0][i]?.document_id      || '',
      docName:  res.metadatas[0][i]?.document_name    || path.basename(name),
      deptCode: res.metadatas[0][i]?.department_code  || '',
      dist:     res.distances[0][i],
      isProd:   false,
    })).filter(c => c.dist < dist);
  } catch { return []; }
}

// Tìm tài liệu ở các phòng ban; nếu là câu hỏi tiếp nối thì tìm thêm TRONG đúng
// những tài liệu vừa được dùng ở lượt trước (focusDocIds) để không lạc sang tài liệu khác.
// (Ngưỡng của lần tìm focus vẫn bị chặn bởi FOCUS_DIST — không còn nhận mọi chunk bất kể liên quan.)
async function searchDocs(deptCodes, vec, focusDocIds) {
  const tasks = deptCodes.map(c => queryCollection(toColName(c), vec, DOC_DIST, TOP_K));
  if (focusDocIds?.length) {
    deptCodes.forEach(c => tasks.push(
      queryCollection(toColName(c), vec, FOCUS_DIST, TOP_K, { document_id: { $in: focusDocIds } })
    ));
  }
  const all = (await Promise.all(tasks)).flat();
  const seen = new Set();
  return all
    .filter(c => { const k = `${c.docId}|${c.text.slice(0, 80)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, TOP_K + 2);
}

async function resolveDeptCodes(state) {
  if (!state.isAdmin) return [state.deptCode];
  try {
    const depts = await Department.find({ isActive: true }).select('code').lean();
    return depts.map(d => d.code);
  } catch { return ['HR', 'IT', 'SALES', 'ACCOUNTING']; }
}

const bestDist = (chunks) => chunks.length ? Math.min(...chunks.map(c => c.dist)).toFixed(3) : 'n/a';

// ── Node: Doc Agent ──────────────────────────────────────────────────
async function nodeDocAgent(state) {
  console.log(`[DocAgent] dept=${state.deptCode} admin=${state.isAdmin} focus=${state.focusDocIds?.length || 0}`);
  const [vec] = await embedTexts([state.expandedQ]);
  const deptCodes = await resolveDeptCodes(state);
  const chunks = await searchDocs(deptCodes, vec, state.focusDocIds);
  console.log(`[DocAgent] ${chunks.length} chunks | best dist=${bestDist(chunks)} (ngưỡng ${DOC_DIST})`);
  return { qVec: vec, chunks, hasCtx: chunks.length > 0 };
}

// ── Node: Product Agent ──────────────────────────────────────────────
async function nodeProductAgent(state) {
  console.log('[ProductAgent] searching...');
  const vec = state.qVec?.length ? state.qVec : (await embedTexts([state.expandedQ]))[0];
  const chunks = await queryCollection('tttn_products', vec, PROD_DIST, TOP_K);
  const prodChunks = chunks.map(c => ({ ...c, isProd: true, docName: c.docName || 'Catalog sản phẩm' }));
  console.log(`[ProductAgent] ${prodChunks.length} products | best dist=${bestDist(prodChunks)} (ngưỡng ${PROD_DIST})`);
  return { qVec: vec, chunks: prodChunks, hasCtx: prodChunks.length > 0 };
}

// ── Node: Both Agent ─────────────────────────────────────────────────
async function nodeBothAgent(state) {
  console.log('[BothAgent] searching docs + products...');
  const [vec] = await embedTexts([state.expandedQ]);
  const deptCodes = await resolveDeptCodes(state);

  const [docResults, prodResults] = await Promise.all([
    searchDocs(deptCodes, vec, state.focusDocIds),
    queryCollection('tttn_products', vec, PROD_DIST, TOP_K).then(r => r.map(c => ({ ...c, isProd: true }))),
  ]);

  const chunks = [...docResults, ...prodResults].sort((a, b) => a.dist - b.dist).slice(0, TOP_K + 2);
  console.log(`[BothAgent] ${chunks.length} chunks | best dist=${bestDist(chunks)}`);
  return { qVec: vec, chunks, hasCtx: chunks.length > 0 };
}

function routeAgent(state) {
  return { doc: 'doc_agent', product: 'product_agent', both: 'both_agent' }[state.queryType] || 'doc_agent';
}

// ── Node: Rerank (lọc active + hybrid vector/keyword) ─────────────────
async function nodeRerank(state) {
  let chunks = await filterActiveChunks(state.chunks || []);
  if (!chunks.length) return { chunks: [], hasCtx: false };

  const q = state.expandedQ || state.question;
  chunks = chunks
    .map(c => ({ ...c, hybridScore: (1 - Math.min(c.dist / 2, 1)) * 0.7 + keywordScore(c.text, q) * 0.3 }))
    .sort((a, b) => b.hybridScore - a.hybridScore);

  if (chunks.length <= 4 || state.needFullDoc) return { chunks, hasCtx: true };

  const weakMatch = Math.min(...chunks.map(c => c.dist)) > WEAK_DIST;

  try {
    const list = chunks.slice(0, 8).map((c, i) => `[${i}] ${c.text.slice(0, 200)}`).join('\n\n');
    const { content } = await llm([{
      role: 'user',
      content: `Câu hỏi: "${q}"\n\nChọn tối đa 4 đoạn liên quan nhất:\n${list}\n\nJSON: {"ids":[<các số 0-based>]}${weakMatch ? '\nNếu KHÔNG có đoạn nào thực sự chứa thông tin để trả lời câu hỏi, trả {"ids":[]}.' : ''}`,
    }], { temperature: 0, maxTokens: 80, json: true });
    const { ids } = JSON.parse(content);
    if (Array.isArray(ids)) {
      if (ids.length === 0 && weakMatch) return { chunks: [], hasCtx: false }; // match yếu + LLM bảo không đoạn nào liên quan
      if (ids.length > 0) {
        const ranked = ids.filter(i => i >= 0 && i < chunks.length).map(i => chunks[i]);
        if (ranked.length) return { chunks: ranked, hasCtx: true };
      }
    }
  } catch {}
  return { chunks: chunks.slice(0, 4), hasCtx: true };
}

// ── Node: Expand — nạp TRỌN tài liệu khi câu hỏi cần toàn cảnh ─────────────
// Câu hỏi kiểu "gồm mấy nội dung", "liệt kê các bước", "mục 6.1–6.5 là gì" không trả lời
// đúng được nếu chỉ có vài đoạn rời rạc → lấy toàn bộ chunk của tài liệu phù hợp nhất
// (theo thứ tự) để model đếm/liệt kê chính xác.
async function nodeExpand(state) {
  const chunks = state.chunks || [];
  if (!state.needFullDoc || !chunks.length) return {};

  const score = {};
  chunks.filter(c => !c.isProd && c.docId).forEach(c => {
    score[c.docId] = (score[c.docId] || 0) + (c.hybridScore ?? (1 - Math.min(c.dist / 2, 1)));
  });
  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!top) return {};
  const ref = chunks.find(c => c.docId === top[0]);

  try {
    const col = await getChroma().getCollection({ name: toColName(ref.deptCode) });
    const res = await col.get({ where: { document_id: top[0] }, include: ['documents', 'metadatas'] });
    const items = (res.documents || [])
      .map((d, i) => ({ text: d, idx: res.metadatas?.[i]?.chunk_index ?? i }))
      .sort((a, b) => a.idx - b.idx);

    let total = 0;
    const kept = [];
    for (const it of items) {
      if (total + it.text.length > FULL_DOC_MAX_CHARS) break;
      kept.push(it); total += it.text.length;
    }
    if (!kept.length) return {};
    console.log(`[Expand] nạp trọn "${ref.docName}": ${kept.length}/${items.length} chunks (${total} ký tự)`);
    return {
      chunks: kept.map(it => ({
        text: it.text, docId: ref.docId, docName: ref.docName, deptCode: ref.deptCode,
        dist: 0, isProd: false, full: true,
      })),
      hasCtx: true,
    };
  } catch (e) {
    console.warn('[Expand] lỗi, dùng các đoạn đã có:', e.message);
    return {};
  }
}

// ── Node: Self-Critique ─────────────────────────────────────────────────
// - Không có chunk nào đạt ngưỡng: dừng ngay (không retry, không tốn token).
//     · câu hỏi quá ngắn/mơ hồ (≤ 2 từ, không phải câu tiếp nối) → hỏi lại người dùng
//     · còn lại → noInfo (trả "không tìm thấy trong tài liệu")
// - Có chunk nhưng chưa chắc đủ: LLM tự chấm; chưa đủ thì viết lại câu hỏi và tìm lại (tối đa N lần).
//   Nếu hết lượt retry vẫn đi tiếp sang generate — generate có chốt chặn [NO_INFO] chống bịa.
async function nodeSelfCritique(state) {
  const retryCount = state.retryCount || 0;
  const chunks = state.chunks || [];
  const q = state.expandedQ || state.question;

  if (chunks[0]?.full) return { hasCtx: true };

  if (!chunks.length) {
    const words = q.trim().split(/\s+/).filter(Boolean).length;
    if (words <= 2 && !state.followUp) return { clarify: true, hasCtx: false };
    return { noInfo: true, hasCtx: false };
  }

  if (chunks.length >= 2 && (chunks[0]?.dist ?? 2) < 0.6) return { hasCtx: true };

  if (retryCount >= MAX_SELF_CRITIQUE_RETRY) return { hasCtx: true };

  try {
    const preview = chunks.slice(0, 4).map((c, i) => `[${i}] ${c.text.slice(0, 180)}`).join('\n');
    const { content } = await llm([{
      role: 'user',
      content: `Câu hỏi: "${q}"\n\nNgữ cảnh tìm được:\n${preview}\n\nNgữ cảnh này có THỰC SỰ chứa thông tin để trả lời chính xác, đầy đủ câu hỏi không?\nJSON: {"sufficient":true|false,"reformulate":"<viết lại câu hỏi để tìm kiếm tốt hơn, nếu cần>"}`,
    }], { temperature: 0, maxTokens: 120, json: true });
    const parsed = JSON.parse(content);

    if (parsed.sufficient === false) {
      return { retryCount: retryCount + 1, expandedQ: (parsed.reformulate || '').trim() || q, hasCtx: false };
    }
  } catch { /* LLM lỗi → đi tiếp với context hiện có, tránh loop vô hạn */ }

  return { hasCtx: chunks.length > 0 };
}

function routeAfterCritique(state) {
  if (state.clarify) return 'clarify';
  if (state.noInfo)  return 'no_info';
  if (!state.hasCtx) return 'retry';
  return 'generate';
}

// ── Node: Ask Clarify ───────────────────────────────────────────────
async function nodeAskClarify(state) {
  const recent = recentTurns(state.history, 4).map(t => `${t.role === 'user' ? 'Người dùng' : 'AI'}: ${t.text}`).join('\n');
  try {
    const { content } = await llm([{
      role: 'user',
      content: `${recent ? `Hội thoại gần đây:\n${recent}\n\n` : ''}Câu hỏi hiện tại: "${state.question}"\nKhông tìm thấy thông tin phù hợp và câu hỏi chưa đủ rõ. Viết 1 câu hỏi lại ngắn gọn, thân thiện bằng tiếng Việt để người dùng làm rõ. Chỉ trả về câu hỏi, không tự đưa thông tin.`,
    }], { temperature: 0.3, maxTokens: 100 });
    return { answer: content.trim(), sources: [], tokens: 0 };
  } catch {
    return { answer: 'Bạn có thể nói rõ hơn bạn đang hỏi về vấn đề/tài liệu nào không?', sources: [], tokens: 0 };
  }
}

// ── Prompt/Sources dùng chung cho generate (non-stream) và stream ──────
function buildGenerateMessages(state) {
  const chunks = state.chunks;
  const contextText = chunks.map(c => `${c.isProd ? '[Sản phẩm]' : `[${c.docName}]`}\n${c.text}`).join('\n\n---\n\n');
  const basePrompt = state.systemPrompt || 'Bạn là trợ lý AI nội bộ của công ty, trả lời bằng tiếng Việt.';
  const interpreted = state.expandedQ && state.expandedQ !== state.question;

  const systemMsg =
`${basePrompt}

QUY TẮC BẮT BUỘC (trả lời sai quy tắc là lỗi nghiêm trọng):
1. CHỈ được dùng thông tin có trong phần "TÀI LIỆU" bên dưới. TUYỆT ĐỐI KHÔNG dùng kiến thức bên ngoài, kiến thức chung, hay suy đoán — kể cả khi bạn biết câu trả lời.
2. Nếu TÀI LIỆU hoàn toàn không chứa thông tin để trả lời câu hỏi, hãy trả lời DUY NHẤT đúng chuỗi: ${NO_INFO_TAG} (không thêm chữ nào khác).
3. Nếu TÀI LIỆU chỉ trả lời được một phần, chỉ nêu phần có trong tài liệu và nói rõ phần còn lại tài liệu chưa đề cập. Không tự bổ sung.
4. Mọi con số, tên, ngày tháng, giá, điều khoản phải trích đúng như trong tài liệu; không làm tròn, không đoán.
5. Khi hỏi về số lượng / danh sách / các mục: đếm và liệt kê đầy đủ, theo đúng thứ tự trong tài liệu.
6. Không viết code, không giải thích kiến thức chung, không làm việc ngoài phạm vi tài liệu dù được yêu cầu.
7. Chỉ dùng lịch sử hội thoại (nếu có) để hiểu câu hỏi tiếp nối; không lấy lịch sử làm nguồn thông tin.
8. Trả lời ngắn gọn, đúng trọng tâm. Cuối câu trả lời ghi (Nguồn: tên_file) cho thông tin quan trọng.${state.conversationSummary ? `\n\nTóm tắt phần hội thoại cũ (chỉ để hiểu ngữ cảnh):\n${state.conversationSummary}` : ''}

TÀI LIỆU:
${contextText}`;

  const messages = [{ role: 'system', content: systemMsg }];
  // Chỉ gửi lịch sử khi câu hỏi là câu tiếp nối → tiết kiệm token và tránh trộn chủ đề cũ / câu trả lời cũ sai
  if (state.followUp) {
    (state.history || []).slice(-4).forEach(m => {
      if (['user', 'assistant'].includes(m.role)) messages.push({ role: m.role, content: (m.content || '').slice(0, 800) });
    });
  }
  messages.push({
    role: 'user',
    content: interpreted ? `${state.question}\n\n(Hiểu theo ngữ cảnh hội thoại: ${state.expandedQ})` : state.question,
  });
  return messages;
}

function buildSources(chunks) {
  const seen = new Set();
  const sources = [];
  chunks.forEach(c => {
    if (!seen.has(c.docName)) {
      seen.add(c.docName);
      sources.push({
        documentId: c.docId || undefined,
        documentName: c.isProd ? `[Sản phẩm] ${c.docName}` : c.docName,
        departmentCode: c.deptCode,
        isProduct: c.isProd || false,
      });
    }
  });
  return sources;
}

// ── Node: Generate ────────────────────────────────────────────────────
async function nodeGenerate(state) {
  if (!state.hasCtx || !state.chunks?.length) {
    console.log('[Generate] No context found');
    return { answer: NO_INFO_MSG, sources: [], tokens: 0 };
  }
  const messages = buildGenerateMessages(state);
  const { content, tokens } = await llm(messages, { temperature: 0, maxTokens: 1200 });
  if (isNoInfo(content)) {
    console.log(`[Generate] model báo [NO_INFO] → trả thông báo chuẩn, không kèm nguồn (${tokens} tokens)`);
    return { answer: NO_INFO_MSG, sources: [], tokens };
  }
  console.log(`[Generate] ✓ ${tokens} tokens | ${state.chunks.length} chunks`);
  return { answer: content, sources: buildSources(state.chunks), tokens };
}

// ── Compile Chat Graph ─────────────────────────────────────────────────
let _chatGraph = null;
function getChatGraph() {
  if (_chatGraph) return _chatGraph;

  _chatGraph = new StateGraph(ChatState)
    .addNode('memory',        nodeMemory)
    .addNode('chitchat',      nodeChitchat)
    .addNode('off_topic',     nodeOffTopic)
    .addNode('router',        nodeRouter)
    .addNode('doc_agent',     nodeDocAgent)
    .addNode('product_agent', nodeProductAgent)
    .addNode('both_agent',    nodeBothAgent)
    .addNode('rerank',        nodeRerank)
    .addNode('expand',        nodeExpand)
    .addNode('self_critique', nodeSelfCritique)
    .addNode('ask_clarify',   nodeAskClarify)
    .addNode('no_info',       nodeNoInfo)
    .addNode('generate',      nodeGenerate)
    .addEdge(START,           'memory')
    .addConditionalEdges('memory', routeAfterMemory, { chitchat: 'chitchat', off_topic: 'off_topic', router: 'router' })
    .addConditionalEdges('router', routeAgent, {
      doc_agent: 'doc_agent', product_agent: 'product_agent', both_agent: 'both_agent',
    })
    .addEdge('doc_agent',     'rerank')
    .addEdge('product_agent', 'rerank')
    .addEdge('both_agent',    'rerank')
    .addEdge('rerank',        'expand')
    .addEdge('expand',        'self_critique')
    .addConditionalEdges('self_critique', routeAfterCritique, {
      retry: 'router', clarify: 'ask_clarify', no_info: 'no_info', generate: 'generate',
    })
    .addEdge('chitchat',      END)
    .addEdge('off_topic',     END)
    .addEdge('ask_clarify',   END)
    .addEdge('no_info',       END)
    .addEdge('generate',      END)
    .compile();

  console.log('[LangGraph] ✓ Chat: memory→(chitchat | off_topic | router→[doc|product|both]→rerank→expand→self_critique→(retry|clarify|no_info|generate))');
  return _chatGraph;
}

// ══════════════════════════════════════════════════════════════════════
// GRAPH 2 — INDEX GRAPH (+ version check)
// ══════════════════════════════════════════════════════════════════════

const IndexState = Annotation.Root({
  filePath:        Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  fileType:        Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  docId:           Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  docName:         Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  deptCode:        Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  deptId:          Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  rawText:         Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  chunks:          Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  vectors:         Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  chunkCount:      Annotation({ reducer: (_, b) => b ?? _, default: () => 0 }),
  colName:         Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  versionAnalysis: Annotation({ reducer: (_, b) => b ?? _, default: () => ({ action: 'new' }) }),
  skipVersionCheck: Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  error:           Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
});

async function idxExtract(state) {
  console.log(`[Index·extract] ${state.fileType} → ${state.docName}`);
  try {
    const text = await extractText(state.filePath, state.fileType);
    if (!text?.trim()) throw new Error('File rỗng hoặc không đọc được nội dung');
    return { rawText: text };
  } catch (e) { return { error: e.message }; }
}

function idxChunk(state) {
  if (state.error) return {};
  const chunks = chunkText(state.rawText);
  if (!chunks.length) return { error: 'Không tạo được chunk' };
  console.log(`[Index·chunk] ${chunks.length} chunks`);
  return { chunks };
}

async function idxEmbed(state) {
  if (state.error || !state.chunks?.length) return {};
  console.log('[Index·embed] Embedding...');
  return { vectors: await embedTexts(state.chunks) };
}

// ── Node: kiểm tra tài liệu mới có trùng/thay thế tài liệu cũ không ────
// So các vector của tài liệu mới với chunk đã có trong cùng phòng ban; nếu
// đủ gần (SUPERSEDE_DIST) với 1 tài liệu cũ → nhờ LLM xác nhận đây là bản
// cập nhật ("update"), trùng lặp hoàn toàn ("duplicate"), hay chỉ trùng 1 phần
// không liên quan ("unrelated") — quyết định này quyết định lúc truy xuất
// sau này có bỏ qua tài liệu cũ hay không.
async function idxVersionCheck(state) {
  if (state.error || !state.vectors?.length) return {};
  if (state.skipVersionCheck) return { versionAnalysis: { action: 'new' } }; // index lại thủ công: không tự archive tài liệu khác
  try {
    const colName = toColName(state.deptCode);
    const chroma = getChroma();
    let col;
    try { col = await chroma.getCollection({ name: colName }); }
    catch { return { versionAnalysis: { action: 'new' } }; }

    const count = await col.count();
    if (count === 0) return { versionAnalysis: { action: 'new' } };

    const probeVecs = state.vectors.slice(0, 5);
    const matchCounts = {};
    for (const vec of probeVecs) {
      const res = await col.query({ queryEmbeddings: [vec], nResults: Math.min(5, count), include: ['metadatas', 'distances'] });
      (res.metadatas?.[0] || []).forEach((meta, i) => {
        const dist = res.distances[0][i];
        if (dist > SUPERSEDE_DIST) return;
        if (!meta.document_id || meta.document_id === state.docId) return;
        const key = meta.document_id;
        if (!matchCounts[key]) matchCounts[key] = { count: 0, minDist: dist, name: meta.document_name };
        matchCounts[key].count += 1;
        matchCounts[key].minDist = Math.min(matchCounts[key].minDist, dist);
      });
    }

    const candidates = Object.entries(matchCounts)
      .map(([docId, v]) => ({ docId, ...v }))
      .sort((a, b) => a.minDist - b.minDist);

    if (!candidates.length) return { versionAnalysis: { action: 'new' } };

    const best = candidates[0];
    if (best.count < 2 && best.minDist > 0.22) return { versionAnalysis: { action: 'new' } };

    const oldDoc = await KnowledgeDocument.findById(best.docId).select('name').lean().catch(() => null);
    const newSample = state.chunks.slice(0, 4).join('\n---\n').slice(0, 3000);

    const { content } = await llm([{
      role: 'user',
      content: `Tài liệu MỚI (tên: "${state.docName}"):\n${newSample}\n\nTài liệu này trùng chủ đề với tài liệu CŨ đã có trong hệ thống (tên: "${oldDoc?.name || best.name}").\nSo sánh và trả JSON:\n{"action":"duplicate"|"update"|"unrelated","diff":"<mô tả ngắn gọn khác biệt, ví dụ giá/số liệu/chính sách thay đổi gì>"}\n- "duplicate": nội dung gần như giống hệt, không có thông tin mới → không cần lưu thêm.\n- "update": tài liệu mới có thông tin cập nhật (giá, chính sách, số liệu...) thay thế tài liệu cũ → tài liệu cũ nên được lưu trữ (archive), chỉ dùng tài liệu mới để trả lời.\n- "unrelated": chỉ trùng 1 phần nhỏ, phần còn lại là chủ đề khác → giữ song song cả 2.`,
    }], { temperature: 0, maxTokens: 300, json: true });

    const parsed = JSON.parse(content);
    const action = ['duplicate', 'update', 'unrelated'].includes(parsed.action) ? parsed.action : 'unrelated';
    console.log(`[VersionCheck] action=${action} vs "${oldDoc?.name || best.name}"`);
    return {
      versionAnalysis: { action, matchedDocId: best.docId, matchedDocName: oldDoc?.name || best.name, diff: parsed.diff || '' },
    };
  } catch (e) {
    console.warn('[VersionCheck] lỗi, bỏ qua kiểm tra phiên bản:', e.message);
    return { versionAnalysis: { action: 'new' } };
  }
}

async function idxSaveChroma(state) {
  if (state.error || !state.vectors?.length) return {};
  if (state.versionAnalysis?.action === 'duplicate') {
    console.log('[Index·chroma] Trùng lặp nội dung với tài liệu cũ → không lưu thêm vào Chroma');
    return { chunkCount: 0, colName: toColName(state.deptCode) };
  }

  const name   = toColName(state.deptCode);
  const chroma = getChroma();
  const col    = await chroma.getOrCreateCollection({
    name,
    metadata: { department_code: state.deptCode, department_id: state.deptId },
  });
  try { await col.delete({ where: { document_id: state.docId } }); } catch {}

  await col.add({
    ids:        state.chunks.map((_, i) => `${state.docId}_chunk_${i}`),
    embeddings: state.vectors,
    documents:  state.chunks,
    metadatas:  state.chunks.map((_, i) => ({
      document_id:     state.docId,
      document_name:   state.docName,
      department_code: state.deptCode,
      department_id:   state.deptId,
      chunk_index:     i,
    })),
  });
  console.log(`[Index·chroma] ✓ ${state.chunks.length} chunks → ${name}`);
  return { chunkCount: state.chunks.length, colName: name };
}

async function idxMongo(state) {
  if (state.error) {
    await KnowledgeDocument.findByIdAndUpdate(state.docId, { status: 'failed', errorMessage: state.error });
    return {};
  }

  const va = state.versionAnalysis || { action: 'new' };
  const update = {
    status:             va.action === 'duplicate' ? 'duplicate' : 'indexed',
    chunkCount:         state.chunkCount,
    chromaCollectionId: state.colName,
    versionNote:        va.diff || '',
  };

  if (va.action === 'update' && va.matchedDocId) {
    update.supersedes = va.matchedDocId;
    await KnowledgeDocument.findByIdAndUpdate(va.matchedDocId, { isActive: false, supersededBy: state.docId }).catch(() => {});
  }
  if (va.action === 'duplicate' && va.matchedDocId) {
    update.isActive  = false; // nội dung trùng lặp hoàn toàn, không cần phục vụ truy vấn
    update.supersedes = va.matchedDocId;
  }

  await KnowledgeDocument.findByIdAndUpdate(state.docId, update);
  console.log(`[Index·mongo] ✓ status=${update.status}`);
  return {};
}

let _indexGraph = null;
function getIndexGraph() {
  if (_indexGraph) return _indexGraph;
  _indexGraph = new StateGraph(IndexState)
    .addNode('extract',       idxExtract)
    .addNode('chunk',         idxChunk)
    .addNode('embed',         idxEmbed)
    .addNode('version_check', idxVersionCheck)
    .addNode('save_chroma',   idxSaveChroma)
    .addNode('update_mongo',  idxMongo)
    .addEdge(START,           'extract')
    .addEdge('extract',       'chunk')
    .addEdge('chunk',         'embed')
    .addEdge('embed',         'version_check')
    .addEdge('version_check', 'save_chroma')
    .addEdge('save_chroma',   'update_mongo')
    .addEdge('update_mongo',  END)
    .compile();
  console.log('[LangGraph] ✓ Index: extract(+vision)→chunk→embed→version_check→chroma→mongo');
  return _indexGraph;
}

// ══════════════════════════════════════════════════════════════════════
// GRAPH 3 — PRODUCT GRAPH (không đổi)
// ══════════════════════════════════════════════════════════════════════

const ProductState = Annotation.Root({
  product:  Annotation({ reducer: (_, b) => b ?? _, default: () => ({}) }),
  mode:     Annotation({ reducer: (_, b) => b ?? _, default: () => 'upsert' }),
  prodText: Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  vector:   Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
});

function prodBuild(state) {
  const p   = state.product;
  const fmt = n => (n && n > 0) ? new Intl.NumberFormat('vi-VN').format(n) + ' VNĐ' : 'Liên hệ';
  const text = [
    `Tên sản phẩm: ${p.name || ''}`,
    `Thương hiệu: ${p.brand || ''}`,
    `Danh mục: ${p.category || ''}`,
    `SKU: ${p.sku || ''}`,
    `Giá bán: ${fmt(p.price)}`,
    `Tồn kho: ${p.stock ?? 0} sản phẩm`,
    p.description ? `Mô tả: ${p.description}` : null,
  ].filter(Boolean).join('\n');
  return { prodText: text };
}

async function prodEmbed(state) {
  if (state.mode === 'delete') return {};
  const [vector] = await embedTexts([state.prodText]);
  return { vector };
}

async function prodUpsert(state) {
  const chroma = getChroma();
  const col    = await chroma.getOrCreateCollection({ name: 'tttn_products', metadata: { type: 'products' } });
  const id     = state.product._id?.toString();
  try { await col.delete({ where: { product_id: id } }); } catch {}

  if (state.mode === 'delete') { console.log('[ProductGraph] ✓ Deleted from ChromaDB'); return {}; }

  const p = state.product;
  await col.add({
    ids: [`product_${id}`], embeddings: [state.vector], documents: [state.prodText],
    metadatas: [{
      product_id: id, name: p.name || '', brand: p.brand || '', category: p.category || '',
      sku: p.sku || '', price: Number(p.price) || 0, stock: Number(p.stock) || 0,
    }],
  });
  console.log(`[ProductGraph] ✓ ${p.name} saved to ChromaDB`);
  return {};
}

let _productGraph = null;
function getProductGraph() {
  if (_productGraph) return _productGraph;
  _productGraph = new StateGraph(ProductState)
    .addNode('build', prodBuild).addNode('embed', prodEmbed).addNode('upsert', prodUpsert)
    .addEdge(START, 'build').addEdge('build', 'embed').addEdge('embed', 'upsert').addEdge('upsert', END)
    .compile();
  console.log('[LangGraph] ✓ Product: build→embed→upsert');
  return _productGraph;
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════

async function ragQuery({ question, departmentCode, departmentName, systemPrompt, history, conversationSummary, isMasterAdmin = false }) {
  try {
    const result = await getChatGraph().invoke({
      question,
      deptCode:            isMasterAdmin ? 'ALL' : (departmentCode || ''),
      deptName:            isMasterAdmin ? 'Toàn Hệ Thống' : (departmentName || ''),
      systemPrompt:        systemPrompt || '',
      history:             history || [],
      conversationSummary: conversationSummary || '',
      isAdmin:             !!isMasterAdmin,
    });
    return { answer: result.answer || '', sources: result.sources || [], tokens: result.tokens || 0 };
  } catch (e) {
    console.error('[LangGraph] ragQuery error:', e.message);
    return { answer: `Lỗi hệ thống AI: ${e.message}`, sources: [], tokens: 0 };
  }
}

// Chạy lại thủ công (không qua StateGraph.invoke) để có thể stream phần generate cuối.
// Vẫn tái sử dụng đúng các node/logic (memory, router, agent, rerank, self-critique).
//  - onStatus(stage): 'understanding' | 'searching' | 'reading' | 'writing' — để UI hiện tiến trình
//  - signal: AbortSignal — client ngắt kết nối thì dừng giữa các bước và huỷ luôn request OpenAI
//  - trả về { aborted: true, answer: <phần đã viết> } khi bị huỷ
async function ragQueryStream({ question, departmentCode, departmentName, systemPrompt, history, conversationSummary, isMasterAdmin = false, onDelta, onStatus, signal }) {
  const status = (s) => { try { onStatus?.(s); } catch { /* UI callback lỗi không được làm hỏng pipeline */ } };
  const guard = () => { if (signal?.aborted) { const e = new Error('aborted'); e.aborted = true; throw e; } };

  let state = {
    question,
    deptCode: isMasterAdmin ? 'ALL' : (departmentCode || ''),
    deptName: isMasterAdmin ? 'Toàn Hệ Thống' : (departmentName || ''),
    systemPrompt: systemPrompt || '',
    history: history || [],
    conversationSummary: conversationSummary || '',
    isAdmin: !!isMasterAdmin,
    expandedQ: '',
    retryCount: 0,
    focusDocIds: [],
    needFullDoc: false,
    typeResolved: false,
    noInfo: false,
    clarify: false,
  };
  let full = '';
  let tokens = 0;

  try {
    guard();
    status('understanding');
    state = { ...state, ...(await nodeMemory(state)) };
    guard();

    if (state.intent === 'chitchat') {
      status('writing');
      const r = await nodeChitchat(state);
      guard();
      if (onDelta) onDelta(r.answer);
      return r;
    }

    if (state.intent === 'offtopic') {
      const r = nodeOffTopic();
      if (onDelta) onDelta(r.answer);
      return r;
    }

    for (let attempt = 0; attempt <= MAX_SELF_CRITIQUE_RETRY; attempt++) {
      status('searching');
      state = { ...state, ...(await nodeRouter(state)) };
      guard();
      const agentFn = { doc: nodeDocAgent, product: nodeProductAgent, both: nodeBothAgent }[state.queryType] || nodeDocAgent;
      state = { ...state, ...(await agentFn(state)) };
      guard();
      status('reading');
      state = { ...state, ...(await nodeRerank(state)) };
      state = { ...state, ...(await nodeExpand(state)) };
      guard();
      state = { ...state, ...(await nodeSelfCritique(state)) };
      guard();
      if (state.clarify || state.noInfo || state.hasCtx) break;
    }

    if (state.clarify) {
      const r = await nodeAskClarify(state);
      guard();
      if (onDelta) onDelta(r.answer);
      return r;
    }
    if (state.noInfo || !state.hasCtx || !state.chunks?.length) {
      const r = nodeNoInfo();
      if (onDelta) onDelta(r.answer);
      return r;
    }

    status('writing');
    const messages = buildGenerateMessages(state);
    const stream = await getOpenAI().chat.completions.create(
      { model: CHAT_MODEL, messages, temperature: 0, max_tokens: 1200, stream: true, stream_options: { include_usage: true } },
      { signal },
    );

    // Đệm vài ký tự đầu để phát hiện [NO_INFO] trước khi đẩy chữ nào xuống UI.
    let pending = '';
    let decided = false;
    let noInfo  = false;

    for await (const part of stream) {
      if (part.usage?.total_tokens) tokens = part.usage.total_tokens;
      const delta = part.choices?.[0]?.delta?.content || '';
      if (!delta) continue;
      full += delta;

      if (decided) { if (onDelta) onDelta(delta); continue; }

      pending += delta;
      const head = pending.trimStart();
      if (head.startsWith(NO_INFO_TAG)) { noInfo = true; break; }
      if (!NO_INFO_TAG.startsWith(head)) {   // chắc chắn không phải [NO_INFO] → xả bộ đệm, stream bình thường
        decided = true;
        if (onDelta) onDelta(pending);
        pending = '';
      }
    }

    if (noInfo) {
      console.log('[RAG] model báo [NO_INFO] → trả thông báo chuẩn, không kèm nguồn');
      if (onDelta) onDelta(NO_INFO_MSG);
      return { answer: NO_INFO_MSG, sources: [], tokens };
    }
    if (!decided && pending) { if (onDelta) onDelta(pending); } // câu trả lời rất ngắn, chưa kịp xả
    return { answer: full, sources: buildSources(state.chunks), tokens };
  } catch (e) {
    if (e.aborted || signal?.aborted || e.name === 'APIUserAbortError') {
      console.log(`[RAG] stream bị huỷ bởi client (đã viết ${full.length} ký tự)`);
      const partial = isNoInfo(full) ? '' : full;
      return { answer: partial, sources: partial ? buildSources(state.chunks || []) : [], tokens, aborted: true };
    }
    console.error('[RAG] ragQueryStream error:', e.message);
    const answer = `Lỗi hệ thống AI: ${e.message}`;
    if (onDelta) onDelta(answer);
    return { answer, sources: [], tokens: 0 };
  }
}

async function indexDocument({ filePath, fileType, documentId, documentName, departmentCode, departmentId, skipVersionCheck = false }) {
  await KnowledgeDocument.findByIdAndUpdate(documentId, { status: 'processing' });
  const result = await getIndexGraph().invoke({
    filePath, fileType, docId: documentId, docName: documentName, deptCode: departmentCode, deptId: departmentId, skipVersionCheck,
  });
  if (result.error) throw new Error(result.error);
  return {
    chunkCount:     result.chunkCount,
    collectionName: result.colName,
    versionAnalysis: result.versionAnalysis || { action: 'new' },
  };
}

async function deleteDocument({ documentId, departmentCode }) {
  try {
    const col = await getChroma().getCollection({ name: toColName(departmentCode) });
    await col.delete({ where: { document_id: documentId } });
    console.log(`[RAG] deleteDocument ✓ ${documentId}`);
  } catch (e) { console.warn('[RAG] deleteDocument:', e.message); }
}

async function indexProduct(product) {
  try { await getProductGraph().invoke({ product, mode: 'upsert' }); }
  catch (e) { console.warn('[LangGraph] indexProduct:', e.message); }
}

async function deleteProduct(productId) {
  try { await getProductGraph().invoke({ product: { _id: productId }, mode: 'delete' }); }
  catch (e) { console.warn('[LangGraph] deleteProduct:', e.message); }
}

async function retrieveChunks({ question, departmentCode }) {
  const [vec] = await embedTexts([question]);
  const chunks = await queryCollection(toColName(departmentCode), vec, DOC_DIST, TOP_K);
  return filterActiveChunks(chunks);
}

async function retrieveProducts(question) {
  const [vec] = await embedTexts([question]);
  return queryCollection('tttn_products', vec, PROD_DIST, TOP_K);
}

// ── So sánh 1 file mới (đính kèm trực tiếp trong chat) với kho tài liệu ────
// Dùng cho tính năng "thêm tài liệu để so sánh" trong khung chat: không lưu
// vào Chroma ngay, chỉ đối chiếu để báo cho người dùng biết trùng/khác gì,
// và gợi ý có nên thay thế tài liệu cũ hay không (người dùng xác nhận ở bước sau).
async function compareDocumentWithKnowledge({ filePath, fileType, fileName, departmentCode }) {
  const rawText = await extractText(filePath, fileType);
  if (!rawText?.trim()) return { verdict: 'no_content', comparedWith: [], summary: 'Không đọc được nội dung file.' };

  const sampleChunks = chunkText(rawText).slice(0, 6);
  if (!sampleChunks.length) return { verdict: 'no_content', comparedWith: [], summary: 'Tài liệu quá ngắn để so sánh.' };

  const vectors = await embedTexts(sampleChunks);
  const colName = toColName(departmentCode);
  let col;
  try { col = await getChroma().getCollection({ name: colName }); }
  catch { return { verdict: 'no_existing', comparedWith: [], summary: 'Chưa có tài liệu nào trong phòng ban này để so sánh — có thể thêm mới bình thường.' }; }

  const count = await col.count();
  if (count === 0) return { verdict: 'no_existing', comparedWith: [], summary: 'Chưa có tài liệu nào trong phòng ban này để so sánh — có thể thêm mới bình thường.' };

  const matchCounts = {};
  for (const vec of vectors) {
    const res = await col.query({ queryEmbeddings: [vec], nResults: Math.min(5, count), include: ['metadatas', 'documents', 'distances'] });
    (res.metadatas?.[0] || []).forEach((meta, i) => {
      const dist = res.distances[0][i];
      if (dist > COMPARE_DIST || !meta.document_id) return;
      const key = meta.document_id;
      if (!matchCounts[key]) matchCounts[key] = { count: 0, minDist: dist, name: meta.document_name, sampleText: res.documents[0][i] };
      matchCounts[key].count += 1;
      matchCounts[key].minDist = Math.min(matchCounts[key].minDist, dist);
    });
  }

  const candidates = Object.entries(matchCounts).map(([docId, v]) => ({ docId, ...v })).sort((a, b) => a.minDist - b.minDist).slice(0, 3);
  if (!candidates.length) {
    return { verdict: 'unrelated', comparedWith: [], summary: 'Không tìm thấy tài liệu nào trong hệ thống trùng chủ đề với file này — có thể thêm mới bình thường.' };
  }

  const compareList = candidates.map(c => `- "${c.name}" (đoạn mẫu: "${c.sampleText.slice(0, 150)}...")`).join('\n');
  const newSample = sampleChunks.join('\n---\n').slice(0, 3000);

  const { content } = await llm([{
    role: 'user',
    content: `Tài liệu MỚI (tên: "${fileName}"):\n${newSample}\n\nCác tài liệu đã có trong hệ thống có nội dung gần giống:\n${compareList}\n\nSo sánh và trả JSON:\n{"verdict":"duplicate"|"update"|"partial_overlap"|"unrelated","targetDoc":"<tên tài liệu cũ liên quan nhất, hoặc rỗng>","summary":"<mô tả ngắn gọn bằng tiếng Việt: giống/khác gì, đặc biệt lưu ý nếu giá cả/số liệu/chính sách thay đổi>"}`,
  }], { temperature: 0, maxTokens: 400, json: true });

  let parsed;
  try { parsed = JSON.parse(content); } catch { parsed = { verdict: 'partial_overlap', summary: content }; }

  const target = candidates.find(c => c.name === parsed.targetDoc) || candidates[0];
  return {
    verdict: ['duplicate', 'update', 'partial_overlap', 'unrelated'].includes(parsed.verdict) ? parsed.verdict : 'partial_overlap',
    comparedWith: candidates.map(c => ({ docId: c.docId, name: c.name })),
    targetDocId: target?.docId || null,
    targetDocName: target?.name || null,
    summary: parsed.summary || '',
    suggestSupersede: parsed.verdict === 'update',
  };
}

// ── Tóm tắt bớt lịch sử hội thoại dài (giữ nguyên SUMMARY_KEEP_RECENT message gần nhất) ──
async function maybeSummarizeSession(session) {
  const msgs = session.messages || [];
  if (msgs.length < SUMMARY_TRIGGER) return null;

  const already = session.summarizedUntil || 0;
  const toSummarize = msgs.slice(already, msgs.length - SUMMARY_KEEP_RECENT);
  if (toSummarize.length < 6) return null;

  const text = toSummarize.map(m => `${m.role === 'user' ? 'Người dùng' : 'AI'}: ${m.content.slice(0, 300)}`).join('\n');
  try {
    const { content } = await llm([{
      role: 'user',
      content: `Tóm tắt ngắn gọn (5-8 câu) các điểm chính đã trao đổi, giữ lại thông tin quan trọng (tên, số liệu, quyết định) làm ngữ cảnh cho các câu hỏi tiếp theo:\n\n${text}${session.summary ? `\n\nTóm tắt trước đó:\n${session.summary}` : ''}`,
    }], { temperature: 0.2, maxTokens: 400 });
    return { summary: content.trim(), summarizedUntil: msgs.length - SUMMARY_KEEP_RECENT };
  } catch (e) {
    console.warn('[Summary] lỗi:', e.message);
    return null;
  }
}

module.exports = {
  ragQuery,
  ragQueryStream,
  indexDocument,
  deleteDocument,
  indexProduct,
  deleteProduct,
  retrieveChunks,
  retrieveProducts,
  extractText,
  chunkText,
  embedTexts,
  compareDocumentWithKnowledge,
  maybeSummarizeSession,
};
