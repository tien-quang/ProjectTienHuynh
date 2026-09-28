const mongoose = require("mongoose");
const Department = require("../models/Department");
const User = require("../models/User");
const Product = require("../models/Product");

const departments = [
  {
    name: "Nhân Sự", code: "HR",
    description: "Phòng Nhân Sự - Quản lý tuyển dụng, chính sách nhân viên",
    color: "#10B981", icon: "users",
    aiSystemPrompt: "Bạn là trợ lý AI của phòng Nhân Sự công ty TTTN. Hãy trả lời các câu hỏi liên quan đến chính sách nhân sự, quy trình tuyển dụng, phúc lợi, nghỉ phép. Luôn trả lời bằng tiếng Việt.",
    welcomeMessage: "Xin chào! Tôi là trợ lý AI phòng Nhân Sự. Tôi có thể giúp bạn về chính sách nhân sự, nghỉ phép, phúc lợi. Hỏi gì đi!"
  },
  {
    name: "Công Nghệ Thông Tin", code: "IT",
    description: "Phòng IT - Hỗ trợ kỹ thuật, hệ thống, bảo mật",
    color: "#3B82F6", icon: "cpu",
    aiSystemPrompt: "Bạn là trợ lý AI của phòng IT công ty TTTN - chuyên về bán laptop và linh kiện. Hãy trả lời các câu hỏi kỹ thuật về sản phẩm, hỗ trợ hệ thống, bảo mật. Luôn trả lời bằng tiếng Việt.",
    welcomeMessage: "Chào bạn! Tôi là trợ lý IT. Tôi có thể tư vấn kỹ thuật về laptop, linh kiện, hoặc hỗ trợ các vấn đề hệ thống."
  },
  {
    name: "Kinh Doanh", code: "SALES",
    description: "Phòng Kinh Doanh - Bán hàng, tư vấn sản phẩm laptop và linh kiện",
    color: "#F59E0B", icon: "shopping-cart",
    aiSystemPrompt: "Bạn là trợ lý AI của phòng Kinh Doanh công ty TTTN - chuyên bán laptop, linh kiện, phụ kiện máy tính. Hãy tư vấn sản phẩm, báo giá, so sánh sản phẩm giúp khách hàng. Luôn nhiệt tình và chuyên nghiệp. Trả lời bằng tiếng Việt.",
    welcomeMessage: "Xin chào! Tôi là tư vấn viên AI của phòng Kinh Doanh TTTN. Bạn cần tư vấn laptop hay linh kiện gì không?"
  },
  {
    name: "Kế Toán", code: "ACCOUNTING",
    description: "Phòng Kế Toán - Tài chính, báo cáo, thuế",
    color: "#8B5CF6", icon: "calculator",
    aiSystemPrompt: "Bạn là trợ lý AI của phòng Kế Toán công ty TTTN. Hãy trả lời các câu hỏi về quy trình thanh toán, báo cáo tài chính, thuế, hóa đơn. Luôn trả lời bằng tiếng Việt.",
    welcomeMessage: "Xin chào! Tôi là trợ lý Kế Toán. Hỗ trợ các vấn đề về thanh toán, hóa đơn, báo cáo tài chính."
  }
];

const sampleProducts = [
  {
    name: "Laptop Dell XPS 15 9530",
    sku: "DELL-XPS15-9530",
    category: "laptop",
    brand: "Dell",
    description: "Laptop cao cấp cho dân sáng tạo và lập trình viên. Màn hình OLED 15.6 inch, Intel Core i7-13700H.",
    price: 45000000,
    stock: 10,
    specifications: { cpu: "Intel Core i7-13700H", ram: "16GB DDR5", ssd: "512GB NVMe", display: "15.6 OLED 3.5K", gpu: "NVIDIA RTX 4060", weight: "1.86kg" }
  },
  {
    name: "Laptop MacBook Air M2",
    sku: "APPLE-MBA-M2-256",
    category: "laptop",
    brand: "Apple",
    description: "Laptop mỏng nhẹ hiệu suất cao chip Apple M2. Pin dài 18 giờ.",
    price: 32000000,
    stock: 15,
    specifications: { cpu: "Apple M2 8 core", ram: "8GB Unified Memory", ssd: "256GB SSD", display: "13.6 Liquid Retina", weight: "1.24kg" }
  },
  {
    name: "RAM Kingston 16GB DDR4 3200MHz",
    sku: "KING-RAM-16G-3200",
    category: "ram",
    brand: "Kingston",
    description: "RAM DDR4 tốc độ cao 3200MHz, tương thích rộng rãi với nhiều mainboard.",
    price: 1200000,
    stock: 50,
    specifications: { capacity: "16GB", type: "DDR4", speed: "3200MHz", latency: "CL22", voltage: "1.35V" }
  },
  {
    name: "SSD Samsung 970 EVO Plus 1TB",
    sku: "SAMSUNG-SSD-970EP-1T",
    category: "ssd",
    brand: "Samsung",
    description: "SSD NVMe M.2 dung lượng 1TB, tốc độ đọc 3500MB/s.",
    price: 2800000,
    stock: 30,
    specifications: { capacity: "1TB", interface: "NVMe M.2", readSpeed: "3500 MB/s", writeSpeed: "3300 MB/s", warranty: "5 năm" }
  },
  {
    name: "Laptop ASUS ROG Strix G16 2024",
    sku: "ASUS-ROG-G16-2024",
    category: "laptop",
    brand: "ASUS",
    description: "Laptop gaming cao cấp Intel Core i9-14900HX, RTX 4080, màn hình 240Hz.",
    price: 68000000,
    stock: 5,
    specifications: { cpu: "Intel Core i9-14900HX", ram: "32GB DDR5", ssd: "1TB NVMe", display: "16 QHD+ 240Hz", gpu: "NVIDIA RTX 4080 12GB", weight: "2.5kg" }
  }
];

const seedDatabase = async () => {
  try {
    // Kiểm tra xem đã seed chưa
    const existingDepts = await Department.countDocuments();
    if (existingDepts > 0) {
      console.log("✅ Database đã có dữ liệu, bỏ qua seed");
      return;
    }

    console.log("🌱 Bắt đầu seed database...");

    // Tạo departments
    const createdDepts = await Department.insertMany(departments);
    console.log(`✅ Đã tạo ${createdDepts.length} phòng ban`);

    // Tạo master admin
    const masterAdmin = await User.create({
      name: "Master Admin TTTN",
      email: "admin@tttn.vn",
      password: "Admin@123456",
      role: "master_admin",
      department: null
    });
    console.log("✅ Đã tạo master admin: admin@tttn.vn / Admin@123456");

    // Tạo managers cho mỗi phòng
    const managerData = [
      { name: "Nguyễn Thị Hương", email: "hr.manager@tttn.vn", dept: "HR" },
      { name: "Trần Văn Minh", email: "it.manager@tttn.vn", dept: "IT" },
      { name: "Lê Thị Thu", email: "sales.manager@tttn.vn", dept: "SALES" },
      { name: "Phạm Văn Đức", email: "accounting.manager@tttn.vn", dept: "ACCOUNTING" }
    ];

    for (const m of managerData) {
      const dept = createdDepts.find(d => d.code === m.dept);
      const manager = await User.create({
        name: m.name,
        email: m.email,
        password: "Manager@123",
        role: "manager",
        department: dept._id
      });
      await Department.findByIdAndUpdate(dept._id, { manager: manager._id });
    }
    console.log("✅ Đã tạo 4 managers");

    // Tạo sample employees
    const hrDept = createdDepts.find(d => d.code === "HR");
    const itDept = createdDepts.find(d => d.code === "IT");
    const salesDept = createdDepts.find(d => d.code === "SALES");

    await User.insertMany([
      { name: "Nguyễn Văn An", email: "an.nguyen@tttn.vn", password: "Emp@123", role: "employee", department: hrDept._id },
      { name: "Trần Thị Bình", email: "binh.tran@tttn.vn", password: "Emp@123", role: "employee", department: itDept._id },
      { name: "Lê Văn Cường", email: "cuong.le@tttn.vn", password: "Emp@123", role: "employee", department: salesDept._id },
    ]);
    console.log("✅ Đã tạo 3 employees mẫu");

    // Tạo sản phẩm mẫu
    const productsWithCreator = sampleProducts.map(p => ({ ...p, createdBy: masterAdmin._id }));
    await Product.insertMany(productsWithCreator);
    console.log(`✅ Đã tạo ${sampleProducts.length} sản phẩm mẫu`);

    console.log("\n🎉 Seed hoàn thành!");
    console.log("📋 Tài khoản mặc định:");
    console.log("   Master Admin: admin@tttn.vn / Admin@123456");
    console.log("   HR Manager: hr.manager@tttn.vn / Manager@123");
    console.log("   IT Manager: it.manager@tttn.vn / Manager@123");
    console.log("   Sales Manager: sales.manager@tttn.vn / Manager@123");
    console.log("   Employee: an.nguyen@tttn.vn / Emp@123");
  } catch (err) {
    console.error("❌ Seed error:", err.message);
  }
};

module.exports = { seedDatabase };
