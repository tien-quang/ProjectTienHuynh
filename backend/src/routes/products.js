const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Product = require("../models/Product");
const AuditLog = require("../models/AuditLog");
const { authenticate, authorize } = require("../middleware/auth");
const { indexProduct, deleteProduct } = require("../services/ragService");

const router = express.Router();

// Ensure upload dir exists
const UPLOAD_DIR = path.join(__dirname, "../../uploads/products");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Chỉ chấp nhận ảnh JPG, PNG, WEBP"));
  }
});

// GET /api/products
router.get("/", authenticate, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 12 } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate("createdBy", "name")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ products, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// GET /api/products/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("createdBy", "name");
    if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// POST /api/products
router.post("/", authenticate, authorize("master_admin", "manager"), upload.single("image"), async (req, res) => {
  try {
    const { name, sku, category, brand, description, price, stock } = req.body;
    if (!name || !sku || !category || !brand || !price) {
      return res.status(400).json({ error: "Vui lòng điền: tên, SKU, danh mục, thương hiệu, giá" });
    }

    const images = req.file ? [`/uploads/products/${req.file.filename}`] : [];

    const product = await Product.create({
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      category,
      brand: brand.trim(),
      description: description || "",
      price: Number(price),
      stock: Number(stock) || 0,
      specifications: {},
      images,
      createdBy: req.user._id
    });

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "PRODUCT_CREATE", targetType: "Product", targetId: product._id, targetName: product.name,
      ipAddress: req.ip
    }).catch(() => {});

    res.status(201).json(product);

    // Index product into ChromaDB for chatbot retrieval
    setImmediate(() => indexProduct(product).catch(e => console.warn("Product index error:", e.message)));
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(400).json({ error: "SKU đã tồn tại, vui lòng dùng SKU khác" });
    res.status(500).json({ error: err.message || "Lỗi server" });
  }
});

// PUT /api/products/:id
router.put("/:id", authenticate, authorize("master_admin", "manager"), upload.single("image"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });

    const { name, category, brand, description, price, stock } = req.body;
    if (name) product.name = name.trim();
    if (category) product.category = category;
    if (brand) product.brand = brand.trim();
    if (description !== undefined) product.description = description;
    if (price) product.price = Number(price);
    if (stock !== undefined) product.stock = Number(stock);

    if (req.file) {
      // Remove old image if exists
      if (product.images?.[0]) {
        const oldPath = path.join(__dirname, "../../", product.images[0]);
        fs.unlink(oldPath, () => {});
      }
      product.images = [`/uploads/products/${req.file.filename}`];
    }
    product.updatedBy = req.user._id;
    await product.save();

    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "PRODUCT_UPDATE", targetType: "Product", targetId: product._id, targetName: product.name,
      ipAddress: req.ip
    }).catch(() => {});

    res.json(product);

    // Re-index updated product in ChromaDB
    setImmediate(() => indexProduct(product).catch(e => console.warn("Product index error:", e.message)));
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(400).json({ error: "SKU đã tồn tại" });
    res.status(500).json({ error: err.message || "Lỗi server" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", authenticate, authorize("master_admin", "manager"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });
    product.isActive = false;
    await product.save();
    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      action: "PRODUCT_DELETE", targetType: "Product", targetId: product._id, targetName: product.name,
      ipAddress: req.ip
    }).catch(() => {});
    res.json({ message: "Đã xóa sản phẩm" });

    // Remove from ChromaDB
    setImmediate(() => deleteProduct(product._id).catch(() => {}));
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
