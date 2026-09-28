const express = require("express");
const AuditLog = require("../models/AuditLog");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/audit
router.get("/", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const { action, actorId, targetType, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (action) filter.action = action;
    if (actorId) filter.actor = actorId;
    if (targetType) filter.targetType = targetType;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Manager chỉ xem log của mình và nhân viên trong phòng
    if (req.user.role === "manager") {
      const { User } = require("../models/User");
      const memberIds = await require("../models/User").find({ department: req.user.department._id }).distinct("_id");
      filter.actor = { $in: [req.user._id, ...memberIds] };
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .populate("actor", "name email avatar")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
