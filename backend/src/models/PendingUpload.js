const mongoose = require("mongoose");

// File đính kèm trong chat đang chờ người dùng xác nhận "thêm / thay thế" vào kho tri thức.
// Client chỉ giữ _id của bản ghi này; đường dẫn file, phòng ban đích, loại file đều do server quyết định.
// TTL 1 giờ: hết hạn thì bản ghi tự xoá (file tạm được dọn bởi sweep trong routes/chat.js).
const pendingUploadSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  session:      { type: mongoose.Schema.Types.ObjectId, ref: "ChatSession", required: true },
  department:   { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  tempPath:     { type: String, required: true },
  originalName: { type: String, required: true },
  fileType:     { type: String, required: true },
  createdAt:    { type: Date, default: Date.now, expires: 3600 },
});

module.exports = mongoose.model("PendingUpload", pendingUploadSchema);
