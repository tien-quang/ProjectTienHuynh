const express = require("express");
const Department = require("../models/Department");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/departments
router.get("/", authenticate, async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .populate("manager", "name email avatar");
    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/departments/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id).populate("manager", "name email avatar");
    if (!dept) return res.status(404).json({ error: "Phòng ban không tồn tại" });

    const memberCount = await User.countDocuments({ department: dept._id, isActive: true });
    res.json({ ...dept.toObject(), memberCount });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// PUT /api/departments/:id - Master admin hoặc Manager phòng ban đó
router.put("/:id", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ error: "Phòng ban không tồn tại" });

    // Manager chỉ sửa phòng ban của mình
    if (req.user.role === "manager" && String(dept._id) !== String(req.user.department._id)) {
      return res.status(403).json({ error: "Không có quyền" });
    }

    const { description, color, icon, welcomeMessage, aiSystemPrompt, manager } = req.body;
    if (description !== undefined) dept.description = description;
    if (color) dept.color = color;
    if (icon) dept.icon = icon;
    if (welcomeMessage) dept.welcomeMessage = welcomeMessage;
    if (aiSystemPrompt !== undefined) dept.aiSystemPrompt = aiSystemPrompt;
    if (manager !== undefined && req.user.role === "master_admin") dept.manager = manager;

    await dept.save();

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "DEPARTMENT_UPDATE", targetType: "Department", targetId: dept._id, targetName: dept.name,
      details: req.body, ipAddress: req.ip
    });

    res.json(dept);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/departments/:id/members
router.get("/:id/members", authenticate, async (req, res) => {
  try {
    const members = await User.find({ department: req.params.id, isActive: true })
      .select("name email role avatar lastLogin createdAt")
      .sort({ name: 1 });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
