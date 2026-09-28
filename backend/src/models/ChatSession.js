const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  sources: [{ // RAG sources used
    documentId: String,
    documentName: String,
    chunk: String,
    score: Number
  }],
  timestamp: { type: Date, default: Date.now },
  tokens: { type: Number, default: 0 },
  imageUrl: { type: String, default: null } // ảnh người dùng đính kèm (multimodal chat)
});

const chatSessionSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Cuộc trò chuyện mới" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    messages: [messageSchema],
    isActive: { type: Boolean, default: true },
    totalTokens: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    // Feedback
    rating: { type: Number, min: 1, max: 5, default: null },
    feedback: { type: String, default: null },
    // Global session (master_admin chat across all departments)
    isGlobal: { type: Boolean, default: false },
    // Tóm tắt phần lịch sử cũ khi hội thoại quá dài (xem ragService.maybeSummarizeSession)
    summary: { type: String, default: "" },
    summarizedUntil: { type: Number, default: 0 }
  },
  { timestamps: true }
);

chatSessionSchema.index({ user: 1, department: 1, createdAt: -1 });

module.exports = mongoose.model("ChatSession", chatSessionSchema);
