

import { Router } from 'express';
import { BlockUnblockOwner, getAllOwners, loginOwner, deleteOwner } from '../../controllers/owner/ownerController.js';
import { createOwner } from '../../controllers/admin/adminController.js';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin } from '../../middlewares/authCheck.js';

const ownersRoutes = Router();

// Public routes (no auth required)
ownersRoutes.post("/", createOwner);
ownersRoutes.post("/login", loginOwner);

// Protected admin routes
ownersRoutes.use(verifyAccessToken);
ownersRoutes.use(requireAdmin);

ownersRoutes.get("/", getAllOwners);
ownersRoutes.put("/:ownerId", BlockUnblockOwner);
ownersRoutes.delete("/:ownerId", deleteOwner);

export default ownersRoutes;