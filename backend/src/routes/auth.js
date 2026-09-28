const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Department = require("../models/Department");
const AuditLog = require("../models/AuditLog");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m"
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
  });
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post("/login", [
  body("email").isEmail().withMessage("Email không hợp lệ"),
  body("password").notEmpty().withMessage("Mật khẩu không được để trống")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).populate("department");

    if (!user || !user.isActive) {
      await AuditLog.create({
        actor: user?._id || null,
        actorName: email,
        actorRole: "unknown",
        action: "LOGIN_FAILED",
        details: { email },
        ipAddress: req.ip
      }).catch(() => {});
      return res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshTokens.push(refreshToken);
    user.lastLogin = new Date();
    await user.save();

    await AuditLog.create({
      actor: user._id,
      actorName: user.name,
      actorRole: user.role,
      action: "LOGIN",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: "Refresh token không được cung cấp" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.refreshTokens.includes(refreshToken) || !user.isActive) {
      return res.status(401).json({ error: "Refresh token không hợp lệ" });
    }

    // Rotate refresh token
    user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: "Refresh token không hợp lệ hoặc đã hết hạn" });
  }
});

// POST /api/auth/logout
router.post("/logout", authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    req.user.refreshTokens = req.user.refreshTokens.filter(t => t !== refreshToken);
    await req.user.save();

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "LOGOUT",
      ipAddress: req.ip
    });

    res.json({ message: "Đăng xuất thành công" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  res.json(req.user);
});

// POST /api/auth/change-password
router.post("/change-password", authenticate, [
  body("oldPassword").notEmpty(),
  body("newPassword").isLength({ min: 6 }).withMessage("Mật khẩu mới tối thiểu 6 ký tự")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) return res.status(400).json({ error: "Mật khẩu cũ không đúng" });

    user.password = newPassword;
    user.refreshTokens = []; // Logout all sessions
    await user.save();

    res.json({ message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});


// POST /api/auth/register
router.post("/register", [
  body("name").trim().notEmpty().withMessage("Họ tên không được để trống"),
  body("email").isEmail().withMessage("Email không hợp lệ"),
  body("password").isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email này đã được sử dụng" });

    const user = await User.create({ name, email, password, role: "employee", isActive: true });
    await user.populate("department");

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshTokens.push(refreshToken);
    await user.save();

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;