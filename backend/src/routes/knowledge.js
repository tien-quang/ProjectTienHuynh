const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const KnowledgeDocument = require("../models/KnowledgeDocument");
const Notification = require("../models/Notification");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticate, authorize } = require("../middleware/auth");
const { indexDocument, deleteDocument } = require("../services/ragService");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "../../uploads/knowledge");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".xlsx", ".csv", ".md", ".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận: PDF, DOCX, TXT, XLSX, CSV, MD, JPG, PNG, WEBP"));
  }
});

// ─── Helper: trigger indexing ─────────────────────────────────────────────────
async function triggerIndex(docId, opts = {}) {
  const doc = await KnowledgeDocument.findById(docId).populate("department", "name code");
  if (!doc || doc.approvalStatus !== "approved") return;

  setImmediate(async () => {
    try {
      await KnowledgeDocument.findByIdAndUpdate(docId, { status: "processing", errorMessage: null });

      const result = await indexDocument({
        filePath: doc.filePath,
        fileType: doc.fileType,
        documentId: doc._id.toString(),
        documentName: doc.name,
        departmentCode: doc.department.code,
        departmentId: doc.department._id.toString(),
        skipVersionCheck: !!opts.reindex,
      });

      // ragService.indexDocument đã tự cập nhật status/isActive/supersedes trong Mongo
      // (bao gồm cả trường hợp "duplicate"/"update") — ở đây chỉ cần đồng bộ thêm chunkCount hiển thị.
      const va = result.versionAnalysis || { action: "new" };
      console.log(`[Knowledge] Indexed: ${doc.name} → ${result.chunkCount} chunks (version: ${va.action})`);

      // Notify department members — nội dung thông báo tuỳ theo kết quả kiểm tra phiên bản
      const members = await User.find({ department: doc.department._id, isActive: true });
      let notifTitle = "Tài liệu mới đã được index";
      let notifMessage = `Tài liệu "${doc.name}" đã sẵn sàng để chatbot truy vấn`;
      if (va.action === "update" && va.matchedDocName) {
        notifTitle = "Tài liệu đã được cập nhật";
        notifMessage = `"${doc.name}" cập nhật thông tin cho "${va.matchedDocName}" — tài liệu cũ đã được lưu trữ, chatbot sẽ chỉ dùng bản mới. ${va.diff ? `(${va.diff})` : ""}`;
      } else if (va.action === "duplicate" && va.matchedDocName) {
        notifTitle = "Tài liệu trùng lặp";
        notifMessage = `"${doc.name}" có nội dung trùng với "${va.matchedDocName}" đã có sẵn — không thêm bản sao vào kho tri thức.`;
      }
      if (members.length > 0) {
        await Notification.insertMany(members.map(m => ({
          recipient: m._id, type: "document_indexed", title: notifTitle, message: notifMessage,
        }))).catch(() => {});
      }
    } catch (e) {
      console.error("[Knowledge] Index error:", e.message);
      await KnowledgeDocument.findByIdAndUpdate(docId, {
        status: "failed",
        errorMessage: e.message,
      });
    }
  });
}

// GET /api/knowledge
router.get("/", authenticate, async (req, res) => {
  try {
    const filter = {};
    const isManager = req.user.role === "master_admin" || req.user.role === "manager";

    // Employee chỉ xem tài liệu đã approved + phòng ban mình
    if (req.user.role === "employee") {
      filter.department = req.user.department?._id;
      filter.approvalStatus = "approved";
    } else if (req.user.role === "manager") {
      filter.department = req.user.department?._id;
    }

    const { department, status, approvalStatus, page = 1, limit = 15, search } = req.query;
    if (department && req.user.role === "master_admin") filter.department = department;
    if (status) filter.status = status;
    if (approvalStatus && isManager) filter.approvalStatus = approvalStatus;
    if (search) filter.name = { $regex: search, $options: "i" };

    const total = await KnowledgeDocument.countDocuments(filter);
    const docs = await KnowledgeDocument.find(filter)
      .populate("department", "name code color")
      .populate("uploadedBy", "name email")
      .populate("approvedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ documents: docs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/knowledge/upload - employee, manager, admin đều upload được
router.post("/upload", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Vui lòng chọn file" });

  try {
    const { name, description, tags, departmentId } = req.body;
    const deptId = departmentId || req.user.department?._id;
    if (!deptId) return res.status(400).json({ error: "Vui lòng chọn phòng ban" });

    // Employee chỉ upload vào phòng ban của mình
    if (req.user.role === "employee") {
      const userDeptId = req.user.department?._id?.toString();
      if (userDeptId !== deptId.toString()) {
        return res.status(403).json({ error: "Bạn chỉ có thể upload vào phòng ban của mình" });
      }
    }

    const Department = require("../models/Department");

    // Handle "ALL" - master_admin upload to all departments
    if (deptId === "ALL" && req.user.role === "master_admin") {
      const allDepts = await Department.find({ isActive: true });
      if (allDepts.length === 0) return res.status(400).json({ error: "Không có phòng ban nào" });

      const fileExt = path.extname(req.file.originalname).toLowerCase().replace(".", "");
      const results = [];

      for (const dept of allDepts) {
        const doc = await KnowledgeDocument.create({
          name: (name || req.file.originalname),
          originalName: req.file.originalname,
          filePath: req.file.path,
          fileType: fileExt,
          fileSize: req.file.size,
          department: dept._id,
          uploadedBy: req.user._id,
          tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          description: description || "",
          approvalStatus: "approved",
          status: "pending",
        });
        results.push(doc);
        triggerIndex(doc._id);
      }

      AuditLog.create({
        actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
        action: "DOCUMENT_UPLOAD", targetType: "Document", targetName: name || req.file.originalname,
        details: { uploadedToAll: true, departmentCount: allDepts.length },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(201).json({ message: `Đã upload cho ${allDepts.length} phòng ban`, count: results.length });
    }

    const dept = await Department.findById(deptId);
    if (!dept) return res.status(404).json({ error: "Phòng ban không tồn tại" });

    const fileExt = path.extname(req.file.originalname).toLowerCase().replace(".", "");
    const isManagerOrAdmin = req.user.role === "master_admin" || req.user.role === "manager";

    const doc = await KnowledgeDocument.create({
      name: name || req.file.originalname,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileType: fileExt,
      fileSize: req.file.size,
      department: deptId,
      uploadedBy: req.user._id,
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      description: description || "",
      // Manager/Admin: auto-approved; Employee: cần duyệt
      approvalStatus: isManagerOrAdmin ? "approved" : "pending_approval",
      status: "pending",
    });

    await doc.populate("department", "name code");
    await doc.populate("uploadedBy", "name email");
    res.status(201).json(doc);

    // Manager/Admin: index ngay; Employee: chờ duyệt
    if (isManagerOrAdmin) {
      triggerIndex(doc._id);
    } else {
      // Notify managers to approve
      const managers = await User.find({
        department: deptId,
        role: { $in: ["manager", "master_admin"] },
        isActive: true
      });
      if (managers.length > 0) {
        await Notification.insertMany(managers.map(m => ({
          recipient: m._id,
          type: "new_document",
          title: "Tài liệu chờ duyệt",
          message: `${req.user.name} đã upload "${doc.name}" và đang chờ bạn duyệt`,
        }))).catch(() => {});
      }
    }

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "DOCUMENT_UPLOAD", targetType: "Document", targetId: doc._id, targetName: doc.name,
      ipAddress: req.ip
    }).catch(() => {});

  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ error: err.message || "Upload thất bại" });
  }
});

// POST /api/knowledge/:id/approve - Manager/Admin duyệt tài liệu
router.post("/:id/approve", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const doc = await KnowledgeDocument.findById(req.params.id).populate("uploadedBy", "name email");
    if (!doc) return res.status(404).json({ error: "Tài liệu không tồn tại" });
    if (doc.approvalStatus !== "pending_approval") {
      return res.status(400).json({ error: "Tài liệu này không ở trạng thái chờ duyệt" });
    }

    await KnowledgeDocument.findByIdAndUpdate(doc._id, {
      approvalStatus: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
      status: "pending",
    });

    res.json({ message: "Đã duyệt tài liệu, đang index..." });

    // Index ngay sau khi duyệt
    triggerIndex(doc._id);

    // Notify người upload
    await Notification.create({
      recipient: doc.uploadedBy._id,
      type: "document_indexed",
      title: "Tài liệu đã được duyệt",
      message: `Tài liệu "${doc.name}" đã được duyệt và đang được xử lý vào hệ thống`,
    }).catch(() => {});

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "DOCUMENT_APPROVE", targetType: "Document", targetId: doc._id, targetName: doc.name,
      ipAddress: req.ip
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/knowledge/:id/reject - Manager/Admin từ chối
router.post("/:id/reject", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await KnowledgeDocument.findById(req.params.id).populate("uploadedBy", "name");
    if (!doc) return res.status(404).json({ error: "Tài liệu không tồn tại" });

    await KnowledgeDocument.findByIdAndUpdate(doc._id, {
      approvalStatus: "rejected",
      rejectionReason: reason || "Không phù hợp",
      approvedBy: req.user._id,
      approvedAt: new Date(),
    });

    // Notify người upload
    await Notification.create({
      recipient: doc.uploadedBy._id,
      type: "system",
      title: "Tài liệu bị từ chối",
      message: `Tài liệu "${doc.name}" đã bị từ chối. Lý do: ${reason || "Không phù hợp"}`,
    }).catch(() => {});

    res.json({ message: "Đã từ chối tài liệu" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// DELETE /api/knowledge/:id
router.delete("/:id", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const doc = await KnowledgeDocument.findById(req.params.id).populate("department", "code");
    if (!doc) return res.status(404).json({ error: "Tài liệu không tồn tại" });

    await deleteDocument({ documentId: doc._id.toString(), departmentCode: doc.department?.code || "GENERAL" });
    if (doc.filePath && fs.existsSync(doc.filePath)) fs.unlink(doc.filePath, () => {});
    await KnowledgeDocument.findByIdAndDelete(req.params.id);

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "DOCUMENT_DELETE", targetType: "Document", targetId: doc._id, targetName: doc.name,
      ipAddress: req.ip
    }).catch(() => {});

    res.json({ message: "Đã xóa tài liệu" });
  } catch (err) {
    res.status(500).json({ error: "Xóa thất bại" });
  }
});

// POST /api/knowledge/:id/reindex
router.post("/:id/reindex", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const doc = await KnowledgeDocument.findById(req.params.id).populate("department", "name code");
    if (!doc) return res.status(404).json({ error: "Tài liệu không tồn tại" });
    if (doc.approvalStatus !== "approved") return res.status(400).json({ error: "Tài liệu chưa được duyệt" });
    if (!fs.existsSync(doc.filePath)) return res.status(400).json({ error: "File gốc không còn tồn tại" });

    // Index lại thủ công: khôi phục tài liệu về trạng thái hoạt động, không tự so sánh/archive lại
    await KnowledgeDocument.findByIdAndUpdate(doc._id, { status: "pending", errorMessage: null, isActive: true, versionNote: "" });
    res.json({ message: "Đang index lại..." });
    triggerIndex(doc._id, { reindex: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
// Cho phép routes/chat.js tái sử dụng luồng index chính thức (dùng ở tính năng
// "So sánh tài liệu trong chat" → xác nhận thêm vào kho tri thức).
module.exports.triggerIndex = triggerIndex;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
