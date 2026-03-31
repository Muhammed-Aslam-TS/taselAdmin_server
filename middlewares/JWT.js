import jwt from "jsonwebtoken";

// Function to generate an access token
export const generateAccessToken = (user, userType = null) => {
  // Determine user type if not provided
  if (!userType) {
    // Check if user has admin-specific fields
    if (user.role && (user.role === 'admin' || user.role === 'super_admin')) {
      userType = 'admin';
    } else if (user.isSubscription !== undefined) {
      userType = 'owner';
    } else {
      userType = 'user';
    }
  }

  const payload = {
    id: user._id,
    username: user.username || user.email,
    userType: userType, // Add user type to token
    role: user.role, // Add role for admins
  };

  // If the user is a 'user' and has an ownerId, include it in the token payload
  if (userType === 'user' && user.ownerId) {
    payload.ownerId = user.ownerId.toString();
  }
  
  const options = {
    expiresIn: "7d", 
  };
  
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, options);
};

// Function to generate a refresh token
export const generateRefreshToken = (user) => {
  const payload = {
    id: user._id,
  };
  const options = {
    expiresIn: "7d", 
  };
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, options); 
};

// Middleware to verify the access token
export const verifyAccessToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    // If no token is present, simply continue. `req.user` will be undefined.
    // Protected routes must use a subsequent middleware (e.g., `requireUser`) to enforce authentication.
    return next();
  }

  // Use ACCESS_TOKEN_SECRET for verification here
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      // If token is invalid/expired, we also continue without setting `req.user`.
      // This allows public access and relies on the frontend to handle token refresh.
      return next();
    }
    req.user = user;
    next();
  });
};

// Middleware to verify the refresh token
export const verifyRefreshToken = (req, res, next) => {
  const token = req.body.refreshToken; 
  if (!token) {
    return res.status(403).json({ message: "No refresh token provided" });
  }

  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    req.body = decoded; 
    next(); 
  });
};
