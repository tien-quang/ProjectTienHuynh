const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        "USER_CREATE", "USER_UPDATE", "USER_DELETE", "USER_ACTIVATE", "USER_DEACTIVATE",
        "USER_RESET_PASSWORD", "USER_ROLE_CHANGE",
        "DOCUMENT_UPLOAD", "DOCUMENT_DELETE", "DOCUMENT_UPDATE",
        "PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE",
        "DEPARTMENT_UPDATE", "DEPARTMENT_CREATE",
        "CHAT_DELETE", "CHAT_EXPORT",
        "LOGIN", "LOGOUT", "LOGIN_FAILED",
        "SYSTEM_SETTING"
      ]
    },
    targetType: { type: String, enum: ["User", "Department", "Document", "Product", "Chat", "System"], default: "System" },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    targetName: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null }
  },
  { timestamps: true }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
