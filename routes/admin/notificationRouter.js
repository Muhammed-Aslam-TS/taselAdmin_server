import { Router } from "express";
import { 
  sendDirectNotification, 
  sendBulkOwnerNotification,
  getAdminNotifications,
  markAdminNotificationRead,
  deleteAdminNotification
} from '../../controllers/admin/notificationController.js';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin } from '../../middlewares/authCheck.js';


const notificationRouter = Router();

// All notification routes require admin authentication
notificationRouter.use(verifyAccessToken);
notificationRouter.use(requireAdmin);

/**
 * Get internal dashboard notifications (Logs)
 */
notificationRouter.get('/', getAdminNotifications);

/**
 * Update notification status
 */
notificationRouter.put('/:id/read', markAdminNotificationRead);

/**
 * Delete a notification log
 */
notificationRouter.delete('/:id', deleteAdminNotification);

/**
 * Send a single outgoing notification (Direct Outgoing)
 */
notificationRouter.post('/direct', sendDirectNotification);

/**
 * Send a bulk outgoing notification to all active owners
 */
notificationRouter.post('/bulk-owners', sendBulkOwnerNotification);

export default notificationRouter;
