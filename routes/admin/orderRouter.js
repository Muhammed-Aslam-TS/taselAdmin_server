import { Router } from 'express';
import { getAllOrders, updateOrderStatus, getOrderStatuses } from '../../controllers/owner/orderController.js';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin } from '../../middlewares/authCheck.js';

const orderRouter = Router();

// All admin order routes require authentication and admin privileges
orderRouter.use(verifyAccessToken);
orderRouter.use(requireAdmin);

// Get all orders (global admin view)
orderRouter.get("/", getAllOrders);

// Get order statuses counts
orderRouter.get("/statuses", getOrderStatuses);

// Update order status
orderRouter.put("/:orderId/status", updateOrderStatus);

export default orderRouter;
