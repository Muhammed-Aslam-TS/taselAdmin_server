

import { Router } from 'express';
import { adminLogin, createAdmin, getAdminProfile } from '../../controllers/admin/adminController.js';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin } from '../../middlewares/authCheck.js';

const adminRoutes = Router();


// Public routes (no auth required)
// adminRoutes.post("/", createAdmin);
adminRoutes.post("/outhenticate/login", adminLogin);
adminRoutes.post("/adminRegister", createAdmin);

// Protected admin routes
adminRoutes.use(verifyAccessToken);
adminRoutes.use(requireAdmin);

// Get admin profile
adminRoutes.get("/profile", getAdminProfile);

// Add other admin routes here that require authentication
// adminRoutes.put("/:ownerId", BlockUnblockOwner);

export default adminRoutes;