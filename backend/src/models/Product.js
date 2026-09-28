const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true },
    category: {
      type: String,
      enum: ["laptop", "linh_kien", "phu_kien", "man_hinh", "ram", "ssd", "cpu", "gpu", "mainboard", "other"],
      required: true
    },
    brand: { type: String, required: true },
    description: { type: String, default: "" },
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    images: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // For AI catalog indexing
    chromaIndexed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", brand: "text" });
productSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model("Product", productSchema);
