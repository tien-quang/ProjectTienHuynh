const express = require("express");
const User = require("../models/User");
const Department = require("../models/Department");
const ChatSession = require("../models/ChatSession");
const KnowledgeDocument = require("../models/KnowledgeDocument");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/admin/dashboard
router.get("/dashboard", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const isMaster = req.user.role === "master_admin";
    const deptFilter = isMaster ? {} : { department: req.user.department._id };

    const [totalUsers, totalDepts, totalSessions, totalDocs, totalProducts, recentChats, usersByDept, chatsByDept] = await Promise.all([
      User.countDocuments({ isActive: true, ...deptFilter }),
      isMaster ? Department.countDocuments({ isActive: true }) : 1,
      ChatSession.countDocuments(deptFilter),
      KnowledgeDocument.countDocuments(deptFilter),
      isMaster ? Product.countDocuments({ isActive: true }) : 0,
      ChatSession.find(deptFilter)
        .populate("user", "name avatar")
        .populate("department", "name code color")
        .select("title lastMessageAt totalTokens user department")
        .sort({ lastMessageAt: -1 })
        .limit(10),
      isMaster ? User.aggregate([
        { $match: { isActive: true, department: { $ne: null } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $lookup: { from: "departments", localField: "_id", foreignField: "_id", as: "dept" } },
        { $unwind: "$dept" },
        { $project: { name: "$dept.name", code: "$dept.code", color: "$dept.color", count: 1 } }
      ]) : [],
      ChatSession.aggregate([
        ...(isMaster ? [] : [{ $match: { department: req.user.department._id } }]),
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $lookup: { from: "departments", localField: "_id", foreignField: "_id", as: "dept" } },
        { $unwind: "$dept" },
        { $project: { name: "$dept.name", code: "$dept.code", color: "$dept.color", count: 1 } }
      ])
    ]);

    // Chat theo tuần
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailyChats = await ChatSession.aggregate([
      { $match: { createdAt: { $gte: weekAgo }, ...deptFilter } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      stats: { totalUsers, totalDepts, totalSessions, totalDocs, totalProducts },
      recentChats,
      usersByDept,
      chatsByDept,
      dailyChats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/admin/system-info
router.get("/system-info", authenticate, authorize("master_admin"), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalTokens = await ChatSession.aggregate([
      { $group: { _id: null, total: { $sum: "$totalTokens" } } }
    ]);

    res.json({
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      totalUsers,
      activeUsers,
      totalTokensUsed: totalTokens[0]?.total || 0,
      environment: process.env.NODE_ENV
    });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
