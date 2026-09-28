require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const connectDB = require("./config/database");
const { seedDatabase } = require("./utils/seed");

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const chatRoutes = require("./routes/chat");
const departmentRoutes = require("./routes/departments");
const knowledgeRoutes = require("./routes/knowledge");
const productRoutes = require("./routes/products");
const adminRoutes = require("./routes/admin");
const auditRoutes = require("./routes/audit");
const notificationRoutes = require("./routes/notifications");

const app = express();

app.set("trust proxy", 1);

function buildCorsOriginValidator() {
  const raw = process.env.CORS_ORIGIN || "";
  const allowList = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  // Keep old behavior: if no CORS_ORIGIN is set, allow all origins.
  if (allowList.length === 0 || allowList.includes("*")) {
    return (origin, callback) => callback(null, true);
  }

  return (origin, callback) => {
    // Non-browser clients (no Origin header) should still pass.
    if (!origin) return callback(null, true);
    if (allowList.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  };
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: buildCorsOriginValidator(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("combined"));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "TTTN Chatbot Backend" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  await seedDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
  });
}

startServer().catch(console.error);
