import User from "../model/usersModel.js";
import Owner from "../model/OwnerModels.js";
import Admin from "../model/AdminModel.js";

// Basic authentication check - verifies JWT token and sets user info
export const checkAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Unauthorized - Authentication required",
        success: false
      });
    }

    const userId = req.user.id;
    const userType = req.user.userType;
    const role = req.user.role;
    
    // Use the user type from the token instead of database lookups
    if (userType === 'admin') {
      req.isAdmin = true;
      req.isOwner = false;
      req.isUser = false;
      req.adminId = userId;
      req.role = role;
      return next();
    } else if (userType === 'owner') {
      req.isOwner = true;
      req.isAdmin = false;
      req.isUser = false;
      req.ownerId = userId;
      return next();
    } else if (userType === 'user') {
      req.isUser = true;
      req.isAdmin = false;
      req.isOwner = false;
      req.userId = userId;

      // The ownerId is included in the JWT payload for users, so no DB lookup is needed.
      if (req.user.ownerId) req.ownerId = req.user.ownerId;
      return next();
    }

    // If user type is not recognized, fall back to database lookup for backward compatibility
    // First check if it's an admin
    const admin = await Admin.findById(userId);
    if (admin) {
      req.isAdmin = true;
      req.isOwner = false;
      req.isUser = false;
      req.adminId = userId;
      return next();
    }

    // Then check if it's an owner
    const owner = await Owner.findById(userId);
    if (owner) {
      req.isOwner = true;
      req.isAdmin = false;
      req.isUser = false;
      req.ownerId = userId;
      return next();
    }

    // Finally check if it's a user
    const user = await User.findById(userId);
    if (user) {
      req.isUser = true;
      req.isAdmin = false;
      req.isOwner = false;
      req.ownerId = user.ownerId; // Store the associated owner's ID
      req.userId = userId;
      return next();
    }

    // If none found
    return res.status(401).json({
      message: "Unauthorized - Invalid authentication",
      success: false
    });

  } catch (error) {
    console.error("Auth check error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking authentication",
      success: false
    });
  }
};

// Admin-only access middleware
export const requireAdmin = async (req, res, next) => {
  try {
    await checkAuth(req, res, () => {});
    if (res.headersSent) return;
    
    if (!req.isAdmin) {
      return res.status(403).json({
        message: "Access denied - Admin privileges required",
        success: false
      });
    }
    
    next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking admin access",
      success: false
    });
  }
};

// Owner-only access middleware
export const requireOwner = async (req, res, next) => {
  try {
    // Call checkAuth to set req.isOwner
    await checkAuth(req, res, () => {});
    if (res.headersSent) return;
    
    if (!req.isOwner) {
      return res.status(403).json({
        message: "Access denied - Owner privileges required",
        success: false
      });
    }
    
    next();
  } catch (error) {
    console.error("requireOwner error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking owner access",
      success: false
    });
  }
};

// User-only access middleware
export const requireUser = async (req, res, next) => {
  try {
    await checkAuth(req, res, () => {});
    if (res.headersSent) return;
    
    if (!req.isUser) {
      return res.status(403).json({
        message: "Access denied - User privileges required",
        success: false
      });
    }
    
    next();
  } catch (error) {
    console.error("requireUser error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking user access",
      success: false
    });
  }
};

// Owner or Admin access middleware
export const requireOwnerOrAdmin = async (req, res, next) => {
  try {
    await checkAuth(req, res, () => {});
    if (res.headersSent) return;
    
    if (!req.isOwner && !req.isAdmin) {
      return res.status(403).json({
        message: "Access denied - Owner or Admin privileges required",
        success: false
      });
    }
    
    next();
  } catch (error) {
    console.error("requireOwnerOrAdmin error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking access",
      success: false
    });
  }
};

// User or Owner access middleware (for products, etc.)
export const requireUserOrOwner = async (req, res, next) => {
  try {
    await checkAuth(req, res, () => {});
    if (res.headersSent) return;
    
    if (!req.isUser && !req.isOwner) {
      return res.status(403).json({
        message: "Access denied - User or Owner privileges required",
        success: false
      });
    }
    
    next();
  } catch (error) {
    console.error("requireUserOrOwner error:", error);
    return res.status(500).json({
      error: error.message,
      message: "Error checking access",
      success: false
    });
  }
};

// Export Privecy as an alias for requireOwner to fix the import error in domainRouter.js
export const Privecy = requireOwner;