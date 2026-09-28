const mongoose = require("mongoose");

const knowledgeDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Approval flow: employee uploads wait for manager/admin approval
    approvalStatus: {
      type: String,
      enum: ["pending_approval", "approved", "rejected"],
      default: "approved" // manager/admin uploads are auto-approved
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    // Index status (only meaningful when approvalStatus === "approved")
    status: {
      type: String,
      enum: ["pending", "processing", "indexed", "failed", "duplicate"],
      default: "pending"
    },
    chunkCount: { type: Number, default: 0 },
    chromaCollectionId: { type: String, default: null },
    errorMessage: { type: String, default: null },
    tags: [{ type: String }],
    description: { type: String, default: "" },
    // Versioning: tài liệu bị archive (isActive:false) không còn được dùng để trả lời trong chat
    isActive: { type: Boolean, default: true },
    supersedes: { type: mongoose.Schema.Types.ObjectId, ref: "KnowledgeDocument", default: null },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "KnowledgeDocument", default: null },
    versionNote: { type: String, default: "" }
  },
  { timestamps: true }
);

knowledgeDocumentSchema.index({ department: 1, status: 1 });
knowledgeDocumentSchema.index({ approvalStatus: 1 });
knowledgeDocumentSchema.index({ isActive: 1 });

module.exports = mongoose.model("KnowledgeDocument", knowledgeDocumentSchema);
