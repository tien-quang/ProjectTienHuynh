const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ChatSession = require("../models/ChatSession");
const Department = require("../models/Department");
const KnowledgeDocument = require("../models/KnowledgeDocument");
const PendingUpload = require("../models/PendingUpload");
const Notification = require("../models/Notification");
const User = require("../models/User");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const { authenticate } = require("../middleware/auth");
const { ragQuery, ragQueryStream, compareDocumentWithKnowledge, maybeSummarizeSession } = require("../services/ragService");
const visionService = require("../services/visionService");
const knowledgeRoutes = require("./knowledge"); // dùng lại triggerIndex cho tính năng xác nhận thay thế tài liệu

const router = express.Router();

// Lịch sử gửi cho AI: giữ cả danh sách tài liệu đã dùng ở mỗi lượt trả lời,
// để câu hỏi tiếp nối ("mục 6.1 là gì?") bám đúng tài liệu vừa nói tới.
function buildHistory(session) {
  return session.messages.slice(-13, -1).map(m => ({
    role: m.role,
    content: m.content,
    sources: (m.sources || []).map(s => ({ documentId: s.documentId, documentName: s.documentName, isProduct: /^\[Sản phẩm\]/.test(s.documentName || '') })),
  }));
}

// ─── Upload tạm cho ảnh đính kèm trong chat & file dùng để so sánh ─────────
const CHAT_UPLOAD_DIR = path.join(__dirname, "../../uploads/chat-temp");
fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHAT_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});

const uploadImage = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Chỉ chấp nhận file ảnh (jpg, png, webp, gif)"), ok);
  },
});

// File so sánh nằm thư mục riêng (không lẫn với ảnh chat vì ảnh chat được lưu vĩnh viễn trong lịch sử)
const COMPARE_UPLOAD_DIR = path.join(__dirname, "../../uploads/compare-temp");
fs.mkdirSync(COMPARE_UPLOAD_DIR, { recursive: true });
const compareStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COMPARE_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});

// Dọn file so sánh bị bỏ dở (PendingUpload đã hết hạn sau 1 giờ) — chạy mỗi 30 phút
function sweepCompareTemp() {
  fs.readdir(COMPARE_UPLOAD_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((f) => {
      const p = path.join(COMPARE_UPLOAD_DIR, f);
      fs.stat(p, (e, st) => { if (!e && st.isFile() && now - st.mtimeMs > 2 * 3600 * 1000) fs.unlink(p, () => {}); });
    });
  });
}
sweepCompareTemp();
setInterval(sweepCompareTemp, 30 * 60 * 1000).unref();

function moveFile(src, dest) {
  try { fs.renameSync(src, dest); }
  catch (e) { if (e.code !== "EXDEV") throw e; fs.copyFileSync(src, dest); fs.unlinkSync(src); }
}

// Cùng quy tắc với POST /api/knowledge/upload: employee chỉ thêm vào phòng ban của mình
function canAddToDept(user, deptId) {
  if (user.role !== "employee") return true;
  return user.department?._id?.toString() === String(deptId);
}

const uploadCompareDoc = multer({
  storage: compareStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [".pdf", ".docx", ".txt", ".xlsx", ".csv", ".md"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Chỉ chấp nhận: PDF, DOCX, TXT, XLSX, CSV, MD"), ok);
  },
});

// GET /api/chat/sessions
router.get("/sessions", authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const sessions = await ChatSession.find({ user: req.user._id })
      .populate("department", "name code color icon")
      .select("-messages")
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await ChatSession.countDocuments({ user: req.user._id });
    res.json({ sessions, total });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/chat/sessions
router.post("/sessions", authenticate, async (req, res) => {
  try {
    const { departmentId } = req.body;

    // Master admin: chat toàn hệ thống (ALL departments)
    if (departmentId === "ALL" && req.user.role === "master_admin") {
      // Use GENERAL dept as placeholder, but RAG will search all
      const generalDept = await Department.findOne({ code: "GENERAL" }) || await Department.findOne();
      const session = await ChatSession.create({
        user: req.user._id,
        department: generalDept._id,
        title: `Chat Toàn Hệ Thống - ${new Date().toLocaleDateString("vi-VN")}`,
        isGlobal: true,
      });
      session._doc.isGlobal = true;
      await session.populate("department", "name code color icon welcomeMessage aiSystemPrompt");
      // Override display info
      session._doc.globalChat = true;
      return res.status(201).json({ ...session.toObject(), isGlobal: true, globalTitle: "Toàn Hệ Thống" });
    }

    const dept = await Department.findById(departmentId);
    if (!dept) return res.status(404).json({ error: "Phòng ban không tồn tại" });

    // Permission: employee chỉ chat phòng ban của mình
    if (req.user.role === "employee") {
      const userDeptId = req.user.department?._id?.toString();
      if (userDeptId !== departmentId) {
        return res.status(403).json({ error: "Bạn chỉ có thể chat trong phòng ban của mình" });
      }
    }

    const session = await ChatSession.create({
      user: req.user._id,
      department: departmentId,
      title: `Chat ${dept.name} - ${new Date().toLocaleDateString("vi-VN")}`
    });
    await session.populate("department", "name code color icon welcomeMessage aiSystemPrompt");
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/chat/sessions/:id
router.get("/sessions/:id", authenticate, async (req, res) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id })
      .populate("department", "name code color icon aiSystemPrompt welcomeMessage");
    if (!session) return res.status(404).json({ error: "Session không tồn tại" });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/chat/sessions/:id/message  ← CORE: RAG pipeline
router.post("/sessions/:id/message", authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Tin nhắn không được để trống" });

    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id })
      .populate("department");
    if (!session) return res.status(404).json({ error: "Session không tồn tại" });

    const dept = session.department;
    const userMsg = { role: "user", content: message.trim(), timestamp: new Date() };
    session.messages.push(userMsg);

    // ─── RAG Query ─────────────────────────────────────────────────────────
    const isGlobalSession = session.isGlobal === true;
    let aiResult
    try {
      aiResult = await ragQuery({
        question: message.trim(),
        departmentCode: isGlobalSession ? 'ALL' : dept.code,
        departmentName: isGlobalSession ? 'Toàn hệ thống' : dept.name,
        systemPrompt: dept.aiSystemPrompt,
        history: buildHistory(session),
        conversationSummary: session.summary || '',
        isMasterAdmin: isGlobalSession,
      })
    } catch (ragErr) {
      console.error("[Chat] RAG error:", ragErr.message)
      // If RAG fails (no OpenAI key etc), give clear message
      aiResult = {
        answer: `⚠️ **Hệ thống AI chưa sẵn sàng**\n\nĐể chatbot hoạt động, cần:\n1. Cấu hình **OPENAI_API_KEY** hợp lệ trong \`backend/.env\`\n2. Khởi động **ChromaDB**: \`docker run -p 8000:8000 chromadb/chroma\`\n\nLỗi: ${ragErr.message}`,
        sources: [],
        tokens: 0
      }
    }

    const assistantMsg = {
      role: "assistant",
      content: aiResult.answer,
      sources: aiResult.sources || [],
      tokens: aiResult.tokens || 0,
      timestamp: new Date()
    };
    session.messages.push(assistantMsg);
    session.totalTokens = (session.totalTokens || 0) + (aiResult.tokens || 0);
    session.lastMessageAt = new Date();

    // Auto title from first question
    if (session.messages.length === 2) {
      session.title = message.trim().substring(0, 60) + (message.length > 60 ? "..." : "");
    }

    await session.save();

    res.json({
      userMessage: session.messages[session.messages.length - 2],
      assistantMessage: assistantMsg,
      sessionId: session._id
    });

    // Hội thoại dài → tóm tắt bớt phần cũ, chạy nền không chặn response
    maybeSummarizeSession(session).then(async (result) => {
      if (result) await ChatSession.findByIdAndUpdate(session._id, result).catch(() => {});
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/chat/sessions/:id/message/stream — trả lời dạng streaming (SSE)
// Sự kiện: {status} (đang hiểu/tra cứu/đọc/viết) · {delta} · {done, sources, userMessage, assistantMessage} · {error}
// Client ngắt kết nối (nút Stop / đóng tab) → huỷ pipeline + request OpenAI để không tốn token vô ích.
router.post("/sessions/:id/message/stream", authenticate, async (req, res) => {
  const text = req.body?.message?.trim();
  if (!text) return res.status(400).json({ error: "Tin nhắn không được để trống" });

  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id }).populate("department");
    if (!session) return res.status(404).json({ error: "Session không tồn tại" });

    const dept = session.department;
    const isGlobalSession = session.isGlobal === true;
    session.messages.push({ role: "user", content: text, timestamp: new Date() });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // tắt buffer của nginx/proxy
    res.flushHeaders?.();

    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });
    const send = (obj) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    let result;
    try {
      result = await ragQueryStream({
        question: text,
        departmentCode: isGlobalSession ? "ALL" : dept.code,
        departmentName: isGlobalSession ? "Toàn hệ thống" : dept.name,
        systemPrompt: dept.aiSystemPrompt,
        history: buildHistory(session),
        conversationSummary: session.summary || "",
        isMasterAdmin: isGlobalSession,
        signal: ac.signal,
        onStatus: (status) => send({ status }),
        onDelta: (delta) => send({ delta }),
      });
    } catch (e) {
      result = { answer: `Lỗi hệ thống AI: ${e.message}`, sources: [], tokens: 0, aborted: ac.signal.aborted };
    }

    // Người dùng bấm Stop trước khi có chữ nào → không lưu gì (câu hỏi cũng không lưu, client sẽ trả lại vào ô nhập)
    if (result.aborted && !(result.answer || "").trim()) return;

    session.messages.push({ role: "assistant", content: result.answer, sources: result.sources || [], tokens: result.tokens || 0, timestamp: new Date() });
    session.totalTokens = (session.totalTokens || 0) + (result.tokens || 0);
    session.lastMessageAt = new Date();
    if (session.messages.length === 2) session.title = text.substring(0, 60) + (text.length > 60 ? "..." : "");
    await session.save();

    const [savedUser, savedAssistant] = session.messages.slice(-2);
    send({ done: true, sources: result.sources || [], userMessage: savedUser, assistantMessage: savedAssistant });
    res.end();

    maybeSummarizeSession(session).then(async (r) => {
      if (r) await ChatSession.findByIdAndUpdate(session._id, r).catch(() => {});
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Lỗi server" });
    else if (!res.writableEnded) { res.write(`data: ${JSON.stringify({ error: "Lỗi server" })}\n\n`); res.end(); }
  }
});

// POST /api/chat/sessions/:id/message-image — chat multimodal: người dùng đính kèm 1 ảnh
router.post("/sessions/:id/message-image", authenticate, uploadImage.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Vui lòng chọn ảnh" });
  try {
    const { message } = req.body;
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id }).populate("department");
    if (!session) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Session không tồn tại" }); }

    const dept = session.department;
    const relUrl = `/uploads/chat-temp/${path.basename(req.file.path)}`;
    const userMsg = { role: "user", content: message?.trim() || "(Đã gửi 1 ảnh)", timestamp: new Date(), imageUrl: relUrl };
    session.messages.push(userMsg);

    const base64 = fs.readFileSync(req.file.path).toString("base64");
    const mimeType = visionService.guessMime(req.file.path);

    // Lấy thêm ngữ cảnh tài liệu nội bộ liên quan (nếu câu hỏi kèm ảnh có nhắc tới nội dung nào đó)
    let contextText = "";
    if (message?.trim()) {
      try {
        const { retrieveChunks } = require("../services/ragService");
        const chunks = await retrieveChunks({ question: message.trim(), departmentCode: session.isGlobal ? "ALL" : dept.code });
        if (chunks.length) contextText = chunks.slice(0, 3).map(c => `[${c.docName}]\n${c.text}`).join("\n\n");
      } catch { /* bỏ qua nếu lỗi truy xuất, vẫn trả lời dựa trên ảnh */ }
    }

    const result = await visionService.answerWithImage({
      base64, mimeType,
      question: message?.trim(),
      systemPrompt: dept.aiSystemPrompt,
      contextText,
      history: session.messages.slice(-6, -1),
    });

    const assistantMsg = { role: "assistant", content: result.content, sources: [], tokens: result.tokens || 0, timestamp: new Date() };
    session.messages.push(assistantMsg);
    session.totalTokens = (session.totalTokens || 0) + (result.tokens || 0);
    session.lastMessageAt = new Date();
    await session.save();

    res.json({ userMessage: session.messages[session.messages.length - 2], assistantMessage: assistantMsg, sessionId: session._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/chat/sessions/:id/compare-document — đính kèm 1 tài liệu để so sánh với kho tri thức
router.post("/sessions/:id/compare-document", authenticate, uploadCompareDoc.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Vui lòng chọn file" });
  const cleanup = () => fs.unlink(req.file.path, () => {});
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id }).populate("department");
    if (!session) { cleanup(); return res.status(404).json({ error: "Session không tồn tại" }); }

    // Phòng ban đích do SERVER xác định (không tin giá trị client gửi lên khi lưu)
    let targetDept = session.department;
    if (session.isGlobal) {
      const code = String(req.body.departmentCode || "").trim().toUpperCase();
      if (code) {
        targetDept = await Department.findOne({ code, isActive: true });
        if (!targetDept) { cleanup(); return res.status(404).json({ error: "Phòng ban không tồn tại" }); }
      }
    }
    if (!canAddToDept(req.user, targetDept._id)) {
      cleanup();
      return res.status(403).json({ error: "Bạn chỉ có thể thêm tài liệu vào phòng ban của mình" });
    }

    const fileType = path.extname(req.file.originalname).toLowerCase().replace(".", "");
    const compareResult = await compareDocumentWithKnowledge({
      filePath: req.file.path, fileType, fileName: req.body.name || req.file.originalname, departmentCode: targetDept.code,
    });

    const verdictLabel = {
      duplicate: "Trùng lặp hoàn toàn với tài liệu đã có",
      update: "Cập nhật thông tin cho tài liệu đã có",
      partial_overlap: "Trùng một phần với tài liệu đã có",
      unrelated: "Không trùng với tài liệu nào trong hệ thống",
      no_existing: "Chưa có tài liệu nào để so sánh",
      no_content: "Không đọc được nội dung file",
    }[compareResult.verdict] || compareResult.verdict;

    const summaryLines = [
      `📎 **So sánh tài liệu "${req.body.name || req.file.originalname}":**`,
      `- Kết luận: ${verdictLabel}`,
      compareResult.comparedWith.length ? `- Tài liệu liên quan: ${compareResult.comparedWith.map(c => c.name).join(", ")}` : null,
      compareResult.summary ? `- Chi tiết: ${compareResult.summary}` : null,
      compareResult.suggestSupersede
        ? `\n👉 Tài liệu mới có vẻ cập nhật thông tin cho "${compareResult.targetDocName}". Bạn có muốn **thay thế** tài liệu cũ bằng tài liệu này không?`
        : (compareResult.verdict === "unrelated" || compareResult.verdict === "no_existing")
          ? `\n👉 Có thể thêm tài liệu này vào kho tri thức bình thường.`
          : null,
    ].filter(Boolean).join("\n");

    const assistantMsg = { role: "assistant", content: summaryLines, sources: [], tokens: 0, timestamp: new Date() };
    session.messages.push({ role: "user", content: `[Đính kèm tài liệu để so sánh] ${req.file.originalname}`, timestamp: new Date() });
    session.messages.push(assistantMsg);
    session.lastMessageAt = new Date();
    await session.save();

    // Client chỉ nhận pendingId — mọi thông tin còn lại (đường dẫn, phòng ban, loại file) nằm ở server
    const pending = await PendingUpload.create({
      user: req.user._id, session: session._id, department: targetDept._id,
      tempPath: req.file.path, originalName: req.file.originalname, fileType,
    });

    res.json({
      assistantMessage: assistantMsg,
      compareResult,
      pendingFile: { pendingId: pending._id.toString() },
    });
  } catch (err) {
    console.error(err);
    cleanup();
    res.status(500).json({ error: err.message || "So sánh thất bại" });
  }
});

// POST /api/chat/sessions/:id/compare-document/confirm — xác nhận thêm mới / thay thế tài liệu cũ
router.post("/sessions/:id/compare-document/confirm", authenticate, async (req, res) => {
  try {
    const { pendingId, action, name } = req.body; // action: "add" | "discard"
    if (!["add", "discard"].includes(action)) return res.status(400).json({ error: "action không hợp lệ" });
    if (!mongoose.isValidObjectId(pendingId) || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Yêu cầu không hợp lệ" });
    }

    // findOneAndDelete = "nhận" bản ghi một lần duy nhất (chống bấm xác nhận 2 lần) và chỉ chủ sở hữu mới nhận được
    const pending = await PendingUpload.findOneAndDelete({ _id: pendingId, user: req.user._id, session: req.params.id });
    if (!pending) return res.status(400).json({ error: "Yêu cầu đã hết hạn hoặc đã xử lý, vui lòng upload lại" });

    const discard = () => fs.unlink(pending.tempPath, () => {});
    if (action === "discard") { discard(); return res.json({ message: "Đã huỷ, không thêm tài liệu này vào kho tri thức" }); }

    if (!canAddToDept(req.user, pending.department)) { discard(); return res.status(403).json({ error: "Bạn không có quyền thêm tài liệu vào phòng ban này" }); }
    const dept = await Department.findById(pending.department);
    if (!dept || !fs.existsSync(pending.tempPath)) { discard(); return res.status(400).json({ error: "File tạm không còn tồn tại, vui lòng upload lại" }); }

    // Chuyển sang thư mục knowledge chính thức rồi chạy qua pipeline index chính thức
    // (idxVersionCheck sẽ tự phát hiện supersede/duplicate khi tài liệu được index).
    const finalPath = path.join(knowledgeRoutes.UPLOAD_DIR, path.basename(pending.tempPath));
    moveFile(pending.tempPath, finalPath);

    // Giống /knowledge/upload: manager/admin được duyệt sẵn, employee phải chờ duyệt
    const isManagerOrAdmin = req.user.role !== "employee";
    const docName = String(name || pending.originalName).trim().slice(0, 200) || pending.originalName;
    const doc = await KnowledgeDocument.create({
      name: docName,
      originalName: pending.originalName,
      filePath: finalPath,
      fileType: pending.fileType,
      fileSize: fs.statSync(finalPath).size,
      department: dept._id,
      uploadedBy: req.user._id,
      approvalStatus: isManagerOrAdmin ? "approved" : "pending_approval",
      status: "pending",
    });

    res.json({
      message: isManagerOrAdmin ? "Đã thêm vào kho tri thức, đang index..." : "Đã gửi tài liệu, đang chờ quản lý duyệt",
      documentId: doc._id,
      approvalStatus: doc.approvalStatus,
    });

    if (isManagerOrAdmin) {
      knowledgeRoutes.triggerIndex(doc._id);
    } else {
      const managers = await User.find({ department: dept._id, role: { $in: ["manager", "master_admin"] }, isActive: true });
      if (managers.length) {
        await Notification.insertMany(managers.map(m => ({
          recipient: m._id, type: "new_document", title: "Tài liệu chờ duyệt",
          message: `${req.user.name} đã upload "${doc.name}" và đang chờ bạn duyệt`,
        }))).catch(() => {});
      }
    }
    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "DOCUMENT_UPLOAD", targetType: "Document", targetId: doc._id, targetName: doc.name,
      details: { via: "chat-compare" }, ipAddress: req.ip,
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/chat/images/:filename — ảnh đính kèm trong chat (thay cho static /uploads/chat-temp).
// Chỉ chủ của cuộc hội thoại chứa ảnh đó mới xem được.
router.get("/images/:filename", authenticate, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    if (!/^[\w.-]+$/.test(filename)) return res.status(400).json({ error: "Tên file không hợp lệ" });
    const owned = await ChatSession.exists({ user: req.user._id, "messages.imageUrl": `/uploads/chat-temp/${filename}` });
    const full = path.join(CHAT_UPLOAD_DIR, filename);
    if (!owned || !fs.existsSync(full)) return res.status(404).json({ error: "Không tìm thấy ảnh" });
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(full);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// DELETE /api/chat/sessions/:id
router.delete("/sessions/:id", authenticate, async (req, res) => {
  try {
    const session = await ChatSession.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ error: "Session không tồn tại" });
    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "CHAT_DELETE", targetType: "Chat", targetId: session._id, ipAddress: req.ip
    }).catch(() => {});
    res.json({ message: "Đã xóa" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/chat/sessions/:id/rating
router.post("/sessions/:id/rating", authenticate, async (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating 1-5" });
    await ChatSession.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { rating });
    res.json({ message: "Cảm ơn phản hồi!" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/chat/sessions/:id/export
router.get("/sessions/:id/export", authenticate, async (req, res) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id })
      .populate("department", "name").populate("user", "name email");
    if (!session) return res.status(404).json({ error: "Session không tồn tại" });

    let content = `=== LỊCH SỬ CHAT ===\n`;
    content += `Phòng ban: ${session.department?.name}\n`;
    content += `Người dùng: ${session.user?.name} (${session.user?.email})\n`;
    content += `Thời gian: ${session.createdAt.toLocaleString("vi-VN")}\n\n${"=".repeat(50)}\n\n`;
    session.messages.forEach(msg => {
      const role = msg.role === "user" ? `👤 ${session.user?.name}` : "🤖 AI";
      content += `${role}:\n${msg.content}\n`;
      if (msg.sources?.length > 0) content += `📎 Nguồn: ${msg.sources.map(s => s.documentName).join(", ")}\n`;
      content += "\n";
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="chat_${session._id}.txt"`);
    res.send(content);

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "CHAT_EXPORT", targetType: "Chat", targetId: session._id, ipAddress: req.ip
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
