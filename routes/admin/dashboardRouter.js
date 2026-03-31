import { Router } from 'express';
import { getOrderStats, getRecentOrders, getOrderOverview, getUsageTrends } from '../../controllers/owner/dashboardController.js';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin
 } from '../../middlewares/authCheck.js';

const dashboardRouter = Router();

// Dashboard routes require either owner or admin authentication
dashboardRouter.use(verifyAccessToken);
dashboardRouter.use(requireAdmin
);

// Get dashboard statistics
dashboardRouter.get("/stats", getOrderStats);

// Get recent orders
dashboardRouter.get("/recent-orders", getRecentOrders);

// Get order overview with line graph
dashboardRouter.get("/overview", getOrderOverview);

// Get usage trends with bar graph and heatmap
dashboardRouter.get("/usage-trends", getUsageTrends);

export default dashboardRouter; 