import { Router } from 'express';
import { verifyAccessToken } from '../../middlewares/JWT.js';
import { requireAdmin } from '../../middlewares/authCheck.js';
import { 
  getSubscriptionDetails, 
  createSubscriptionPlan, 
  getAllSubscriptionPlans, 
  deleteSubscriptionPlan 
} from '../../controllers/admin/subscriptionController.js';

const subscriptionRouter = Router();

// All admin subscription routes require authentication and admin privileges
subscriptionRouter.use(verifyAccessToken);
subscriptionRouter.use(requireAdmin);

// Get subscription details (plans list)
subscriptionRouter.get('/', getSubscriptionDetails);

// Get all subscription plans
subscriptionRouter.get('/plans', getAllSubscriptionPlans);

// Create a new subscription plan
subscriptionRouter.post('/plans', createSubscriptionPlan);

// Delete a subscription plan
subscriptionRouter.delete('/plans/:name', deleteSubscriptionPlan);

export default subscriptionRouter;