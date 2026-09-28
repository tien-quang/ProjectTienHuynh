const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Department = require("../models/Department");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/users - Master admin xem tất cả, Manager xem theo phòng ban
router.get("/", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const filter = { isActive: { $ne: false } };
    if (req.user.role === "manager") {
      // Manager chỉ thấy user trong phòng ban mình, không thấy master_admin
      filter.department = req.user.department._id;
      filter.role = { $ne: "master_admin" };
    } else if (req.user.role === "employee") {
      // Employee chỉ thấy chính mình
      filter._id = req.user._id;
    }
    const { search, role, department, page = 1, limit = 20 } = req.query;
    if (search) filter.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    // Manager không được filter theo role master_admin
    if (role && req.user.role === "master_admin") filter.role = role;
    if (role && req.user.role === "manager" && role !== "master_admin") filter.role = role;
    if (department && req.user.role === "master_admin") filter.department = department;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .populate("department", "name code color")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/users - Master admin tạo user mới
router.post("/", authenticate, authorize("master_admin", "manager"), [
  body("name").notEmpty().withMessage("Tên không được để trống"),
  body("email").isEmail().withMessage("Email không hợp lệ"),
  body("password").isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
  body("role").isIn(["employee", "manager"]).withMessage("Quyền không hợp lệ"),
  body("department").notEmpty().withMessage("Phòng ban không được để trống")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, email, password, role, department } = req.body;

    // Manager chỉ tạo employee trong phòng ban của mình
    if (req.user.role === "manager" && (role !== "employee" || String(department) !== String(req.user.department._id))) {
      return res.status(403).json({ error: "Manager chỉ được tạo employee trong phòng ban mình" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email đã tồn tại" });

    const user = await User.create({ name, email, password, role, department, createdBy: req.user._id });
    await user.populate("department", "name code");

    await Notification.create({
      recipient: user._id,
      type: "user_created",
      title: "Chào mừng đến TTTN Chatbot!",
      message: `Tài khoản của bạn đã được tạo. Phòng ban: ${user.department?.name}`
    });

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "USER_CREATE", targetType: "User", targetId: user._id, targetName: user.name,
      ipAddress: req.ip
    });

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/users/:id
router.get("/:id", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("department");
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// PUT /api/users/:id - Cập nhật user (user tự update profile mình, manager/admin update người khác)
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { name, email, role, department, isActive, avatar } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    const isSelf = String(req.user._id) === String(user._id);
    const isAdmin = req.user.role === "master_admin";
    const isManager = req.user.role === "manager";

    // Không ai được sửa master_admin (trừ chính master_admin tự sửa mình)
    if (user.role === "master_admin" && !isSelf) {
      return res.status(403).json({ error: "Không có quyền chỉnh sửa Master Admin" });
    }
    // Employee chỉ được sửa chính mình
    if (!isSelf && !isAdmin && !isManager) {
      return res.status(403).json({ error: "Không có quyền" });
    }
    // Manager chỉ sửa user trong phòng ban mình (nếu không phải chính mình)
    if (!isSelf && isManager) {
      if (String(user.department) !== String(req.user.department?._id)) {
        return res.status(403).json({ error: "Không có quyền sửa user này" });
      }
    }

    // Tất cả đều sửa được tên
    if (name) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;

    // Chỉ admin/manager mới sửa email
    if (email && (isAdmin || isManager)) user.email = email;

    // Chỉ master_admin mới sửa role, department, isActive
    if (isAdmin) {
      if (role) user.role = role;
      if (department) user.department = department;
      if (isActive !== undefined) user.isActive = isActive;
    }
    // Manager sửa được department của employee trong phòng mình
    if (isManager && !isSelf) {
      if (department) user.department = department;
    }

    await user.save();
    await user.populate("department", "name code");

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "USER_UPDATE", targetType: "User", targetId: user._id, targetName: user.name,
      details: { name, email }, ipAddress: req.ip
    }).catch(() => {});

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// PUT /api/users/:id/password - User tự đổi mật khẩu của mình
router.put("/:id/password", authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: "Vui lòng điền đầy đủ" });
    if (newPassword.length < 6) return res.status(400).json({ error: "Mật khẩu mới tối thiểu 6 ký tự" });

    // Chỉ được đổi mật khẩu của chính mình
    if (String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ error: "Không có quyền đổi mật khẩu người khác" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });

    user.password = newPassword;
    user.refreshTokens = []; // logout all other sessions
    await user.save();

    AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "USER_CHANGE_PASSWORD", targetType: "User", targetId: user._id, targetName: user.name,
      ipAddress: req.ip
    }).catch(() => {});

    res.json({ message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// DELETE /api/users/:id - Chỉ master admin
router.delete("/:id", authenticate, authorize("master_admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    if (user.role === "master_admin") return res.status(400).json({ error: "Không thể xóa master admin" });

    user.isActive = false;
    await user.save();

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "USER_DELETE", targetType: "User", targetId: user._id, targetName: user.name,
      ipAddress: req.ip
    });

    res.json({ message: "Đã vô hiệu hóa tài khoản" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/users/:id/reset-password
router.post("/:id/reset-password", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Mật khẩu tối thiểu 6 ký tự" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    // Manager không được reset mật khẩu master_admin
    if (user.role === "master_admin" && req.user.role !== "master_admin") {
      return res.status(403).json({ error: "Không có quyền reset mật khẩu Master Admin" });
    }

    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();

    await Notification.create({
      recipient: user._id,
      type: "password_reset",
      title: "Mật khẩu đã được đặt lại",
      message: "Admin đã đặt lại mật khẩu của bạn. Vui lòng đổi mật khẩu sau khi đăng nhập."
    });

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "USER_RESET_PASSWORD", targetType: "User", targetId: user._id, targetName: user.name,
      ipAddress: req.ip
    });

    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
