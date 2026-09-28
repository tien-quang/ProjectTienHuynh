const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      enum: ["HR", "IT", "SALES", "ACCOUNTING", "GENERAL"]
    },
    description: { type: String, default: "" },
    color: { type: String, default: "#4F46E5" },
    icon: { type: String, default: "building" },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isActive: { type: Boolean, default: true },
    // System prompt for AI persona in this department
    aiSystemPrompt: { type: String, default: "" },
    // Welcome message
    welcomeMessage: { type: String, default: "Xin chào! Tôi có thể giúp gì cho bạn?" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);
