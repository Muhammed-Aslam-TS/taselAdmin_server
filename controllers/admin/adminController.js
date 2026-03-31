import Admin from "../../model/AdminModel.js";
import bcrypt from "bcrypt";
import { generateAccessToken } from "../../middlewares/JWT.js";
import Owner from "../../model/OwnerModels.js";
import Subscription from "../../model/subscriptionModel.js";
import cron from "node-cron";
import AdminNotification from "../../model/AdminNotification.js";

export const createAdmin = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: " email and password are required",
      });
    }

    // Security Check: Only allow public creation if NO admins exist
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      // If admins exist, require Super Admin privileges
      // if (!req.user || req.user.role !== "super_admin") {
      //   return res.status(403).json({
      //     success: false,
      //     message:
      //       "Admin creation is restricted. Only Super Admins can create new admins.",
      //   });
      // }
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }],
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email or username already exists",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const newAdmin = new Admin({
      email,
      password: hashedPassword,
      role: role || "admin", // Default to 'admin' if role not specified
    });

    await newAdmin.save();

    // Generate JWT token
    const token = generateAccessToken(newAdmin, "admin");

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: {
        id: newAdmin._id,
        email: newAdmin.email,
        role: newAdmin.role,
        token,
      },
    });
  } catch (error) {
    console.error("Admin creation error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating admin",
      error: error.message,
    });
  }
};

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = generateAccessToken(admin, "admin");

    res.status(200).json({
      success: true,
      message: "Login successful",
      token, // Flattened for frontend
      user: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
      data: { // Kept for legacy support
        id: admin._id,
        email: admin.email,
        role: admin.role,
        token,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
};

export const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id; // Get admin ID from authenticated user

    const admin = await Admin.findById(adminId).select("-password"); // Exclude password from response

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Admin information retrieved successfully",
      data: admin,
    });
  } catch (error) {
    console.error("Error retrieving admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving admin information",
      error: error.message,
    });
  }
};

export const createOwner = async (req, res) => {
  try {
    const { email, password, username, phone } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Check if owner already exists
    const existingOwner = await Owner.findOne({ email });
    if (existingOwner) {
      return res
        .status(400)
        .json({ message: "Owner with this email already exists" });
    }

    // Generate a unique username if not provided
    let finalUsername = username;
    if (!finalUsername) {
      // Create username from email (before @ symbol)
      finalUsername = email.split("@")[0];
      // Add random number to ensure uniqueness
      finalUsername = `${finalUsername}${Math.floor(Math.random() * 1000)}`;
    }

    // Check if username is already taken
    const existingUsername = await Owner.findOne({ username: finalUsername });
    if (existingUsername) {
      // If username exists, add more random numbers
      finalUsername = `${finalUsername}${Math.floor(Math.random() * 10000)}`;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Calculate trial end date (7 days from now)
    const startDate = new Date();
    const trialEndDate = new Date(startDate);
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    // Assign default domain for store configuration
    const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";
    const defaultDomain = `${finalUsername}.${BASE_DOMAIN}`;

    // Create a new owner with subscription enabled (Trial)
    const newOwner = new Owner({
      email,
      username: finalUsername,
      password: hashedPassword,
      primaryDomain: defaultDomain, // Assign default domain
      storeDomains: [defaultDomain], // Add to store domains list
      isSubscription: true,
      planName: "TRIAL",
      SubscriptionStartTime: startDate,
      SubscriptionEndTime: trialEndDate,
    });
    await newOwner.save();


    // Create trial subscription record
    const subscription = new Subscription({
      ownerId: newOwner._id,
      plan: "TRIAL",
      status: "TRIAL",
      startDate,
      endDate: trialEndDate,
      isTrial: true,
      features: {
        maxUsers: 5,
        maxProducts: 50,
        analytics: false,
        customDomain: false,
        prioritySupport: false,
      },
      billingCycle: "FREE",
    });

    await subscription.save();


    const token = generateAccessToken(newOwner);

    // Create referral code
    const referralCode = `REF-${newOwner._id.toString().slice(-6).toUpperCase()}`;
    newOwner.referralCode = referralCode;
    await newOwner.save();

    // Log this as a system notification for the Admin Dashboard
    await AdminNotification.create({
      title: "New Owner Registered",
      message: `Owner ${newOwner.username} (${newOwner.email}) has been registered and assigned to ${newOwner.primaryDomain}.`,
      type: "success",
      category: "owner_registration",
      metadata: { ownerId: newOwner._id }
    });

    res.status(201).json({
      message: "Owner created successfully",
      user: {
        id: newOwner._id,
        email: newOwner.email,
        username: newOwner.username,
        referralCode: newOwner.referralCode,
      },
      token,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        features: subscription.features,
        daysRemaining: Math.ceil(
          (trialEndDate - startDate) / (1000 * 60 * 60 * 24),
        ),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error creating owner",
      error: error.message,
    });
  }
};
