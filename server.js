import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import connectDB from "./config/db.js";

// Import Admin Routers
import adminRoutes from "./routes/admin/adminRoutes.js";
import dashboardRouter from "./routes/admin/dashboardRouter.js";
import bannerRoutes from "./routes/admin/bannerRoutes.js";
import ownersRoutes from "./routes/admin/ownersRoutes.js";
import subscriptionRouter from "./routes/admin/subscriptionRouter.js";
import orderRouter from "./routes/admin/orderRouter.js";
import notificationRouter from "./routes/admin/notificationRouter.js";
import { adminLogin, createAdmin } from "./controllers/admin/adminController.js";

const app = express();
const PORT = process.env.ADMIN_PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== MIDDLEWARES ==========
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(morgan("dev"));

// Trace requests
app.use((req, res, next) => {
  console.log(`[Admin Trace] ${req.method} ${req.originalUrl}`);
  next();
});

// ========== CORS HANDLER ==========
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


// ========== ADMIN API ROUTES (SIDEBAR MAPPING) ==========

// 1. Dashboard
app.use("/api/dashboard", dashboardRouter);

// 2. Manage Banners
app.use("/api/banners", bannerRoutes);

// 3. Manage Owners
app.use("/api/owners", ownersRoutes);

// 4. Manage Subscriptions
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/subscriptionfromAdmin", subscriptionRouter); // Legacy alias

// 5. Manage Orders
app.use("/api/orders", orderRouter);

// 6. Admin Notifications (Bulk/Direct)
app.use("/api/notifications", notificationRouter);


// --- Core Admin & Auth ---
app.use("/api/admin", adminRoutes);

// ========== CORE AUTH ENDPOINTS ==========
// Standardized login endpoints for the admin panel
app.post("/api/authenticate/login", adminLogin);
app.post("/api/admin/login", adminLogin); // Standardized alias

// Registration endpoint
app.post("/api/admin/register", createAdmin);
app.post("/api/admin/adminRegister", createAdmin); // Legacy support


import { seedSubscriptionPlans } from "./model/subscriptionPlans.js";


// ========== CONNECT DATABASE & START SERVER ==========
connectDB().then(async () => {
  // Seed default data
  await seedSubscriptionPlans();
  
  const server = app.listen(PORT, () => {
    const healthUrl = `http://localhost:${PORT}/api/admin/profile`;
    console.log(`\n-----------------------------------------------------------`);
    console.log(`🚀 Dedicated Admin Server running on port ${PORT}`);
    console.log(`🔗 Admin API Health Check: ${healthUrl}`);
    
    // Log static serving status
    const distAdminPath = path.join(__dirname, "dist");
    if (fs.existsSync(distAdminPath)) {
      console.log(`📂 Admin Dashboard: Serving from /admin -> ${distAdminPath}`);
    } else {
      console.warn(`⚠️ Warning: 'dist' folder not found. Frontend will not be served via /admin.`);
    }
    console.log(`-----------------------------------------------------------\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please check for other running processes.`);
    } else {
      console.error("🚀 Server error:", err);
    }
    process.exit(1);
  });
}).catch(err => {
  console.error("Failed to start admin server due to DB connection error:", err);
  process.exit(1);
});

// ========== ROUTING & STATIC FILES ==========

// 1. API 404 Handler (Catch-all for missing API endpoints)
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Admin API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// 2. Serve Frontend (Admin Dashboard)
// This must be placed AFTER API routes to avoid conflicts
const distAdminPath = path.join(__dirname, "dist");

// Serve static assets
app.use("/admin", express.static(distAdminPath));

// SPA Fallback: Send index.html for any /admin/* route that doesn't match a file
app.get(["/admin", "/admin/*"], (req, res) => {
  const indexPath = path.join(distAdminPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Admin Frontend not found. Please run build or copy build artifacts to 'dist' folder.");
  }
});
