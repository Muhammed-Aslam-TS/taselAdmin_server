import Subscription from "../model/subscriptionModel.js";
import User from "../model/usersModel.js";
import Product from "../model/product.js";

// Check if subscription is active
export const checkSubscription = async (req, res, next) => {
  try {
    // Use req.ownerId if available (from auth middleware), otherwise fallback to req.user.id
    const ownerId = req.ownerId || req.user.id;

    const subscription = await Subscription.findOne({ ownerId });
    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // Check if subscription is expired by date
    const now = new Date();
    if (subscription.endDate < now) {
      // If expired but status is still active/trial, expire it now (lazy expiration)
      if (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL') {
        await subscription.expireSubscription();
      }
      return res.status(403).json({
        success: false,
        message: "Your subscription has expired. Please renew to continue.",
      });
    }

    // Check if subscription is active or in trial
    if (!subscription.isActive()) {
      return res.status(403).json({
        success: false,
        message: "Your subscription has expired. Please renew to continue.",
      });
    }

    // Add subscription info to request
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking subscription status",
      error: error.message,
    });
  }
};

// Check user limit
export const checkUserLimit = async (req, res, next) => {
  try {
    const ownerId = req.ownerId || req.user.id;
    const subscription = req.subscription;

    // Count total users under this owner
    const userCount = await User.countDocuments({ ownerId });

    if (userCount >= subscription.features.maxUsers) {
      return res.status(403).json({
        success: false,
        message: `You have reached the maximum limit of ${subscription.features.maxUsers} users for your current plan. Please upgrade to add more users.`,
      });
    }

    next();
  } catch (error) {
    console.error("User limit check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user limit",
      error: error.message,
    });
  }
};

// Check product limit
export const checkProductLimit = async (req, res, next) => {
  try {
    const ownerId = req.ownerId || req.user.id;
    const subscription = req.subscription;

    // Count total products under this owner
    const productCount = await Product.countDocuments({ ownerId });

    if (productCount >= subscription.features.maxProducts) {
      return res.status(403).json({
        success: false,
        message: `You have reached the maximum limit of ${subscription.features.maxProducts} products for your current plan. Please upgrade to add more products.`,
      });
    }

    next();
  } catch (error) {
    console.error("Product limit check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking product limit",
      error: error.message,
    });
  }
};

// Check if feature is available
export const checkFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const subscription = req.subscription;

      if (!subscription.features[feature]) {
        return res.status(403).json({
          success: false,
          message: `This feature is not available in your current plan. Please upgrade to access ${feature}.`,
        });
      }

      next();
    } catch (error) {
      console.error("Feature check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking feature availability",
        error: error.message,
      });
    }
  };
}; 