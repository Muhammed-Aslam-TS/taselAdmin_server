// controllers/users/authController.js

// import User from "../../model/usersModel.js";
// import bcrypt from "bcrypt";
// import { v4 as uuidv4 } from "uuid"; // Import uuid for generating unique IDs
// import { generateAccessToken } from "../../middlewares/JWT.js"; // Import the function to generate JWT

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { generateAccessToken } from '../../middlewares/JWT.js'; // JWT generation function
import Owner from '../../model/OwnerModels.js';
import User from "../../model/usersModel.js";
import Order from "../../model/orderModel.js";
import crypto from 'crypto';
import { createClient } from 'redis';
import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

// const redisClient = createClient({ url: 'redis://localhost:6379' });
// redisClient.connect();
const redisClient = createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(err => console.error('Redis Client Error', err));

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// In-memory OTP store (for demo; use Redis or DB in production)
const otpStore = {};

// Helper function to format mobile number
const formatMobileNumber = (mobile) => {
  // Remove any existing +91 prefix
  let cleanMobile = mobile.replace(/^\+91/, '');
  // Add +91 prefix if not present
  return `+91${cleanMobile}`;
};

export const createUser = async (req, res) => {
  try {
    const { username, password, email, mobile } = req.body;
    let { referralCode } = req.body;

    // Validate input (referralCode is now optional in body)
    const missingFields = [];
    if (!username) missingFields.push("username");
    if (!password) missingFields.push("password");
    if (!email) missingFields.push("email");
    if (!mobile) missingFields.push("mobile");

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(", ")}`,
        missingFields 
      });
    }

    // --- AUTOMATIC REFERRAL CODE LOGIC ---
    // If referralCode is not provided in the body, try to get it from the tenant (owner)
    if (!referralCode && req.owner) {
      referralCode = req.owner.referralCode;
      console.log(`ℹ️ Auto-populating referralCode from tenant context: ${referralCode}`);
    }

    // If still no referralCode, we can't proceed as we need to link to an owner
    if (!referralCode) {
      return res.status(400).json({ 
        message: "Referral code is required to link you to a store. Please visit the store's direct link.",
        missingFields: ["referralCode"] 
      });
    }

    // Check if email, username, or mobile already exist
    const [existingEmail, existingUsername, existingMobile] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ username }),
      User.findOne({ mobile }),
    ]);

    if (existingEmail) {
      return res.status(400).json({ message: "User already exists with this email" });
    }
    if (existingUsername) {
      return res.status(400).json({ message: "Username already taken" });
    }
    if (existingMobile) {
      return res.status(400).json({ message: "Mobile number already registered" });
    }

    // Find the owner by referral code
    const owner = await Owner.findOne({ referralCode });

    if (!owner) {
      return res.status(400).json({ message: "Invalid referral code" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a readable user referral ID instead of UUID
    // Format: U-REF-XXXXXX (last 6 chars of a random crypto hex)
    const referralId = `U-REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Create a new user and associate with the owner
    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      mobile,
      referralId,
      ownerId: owner._id, // Link the user to the owner via ownerId
      isActive: true,
    });

    await newUser.save();

    // Generate JWT token
    const token = generateAccessToken(newUser, 'user'); // Generate token using the new user

    res.status(201).json({
      message: "User created successfully",
      user: newUser,
      token, // Include token in the response
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};


// Import Admin model
import Admin from "../../model/AdminModel.js";

export const userLogin = async (req, res) => {
  try {
    const { password, email } = req.body;


    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    let account = await User.findOne({ email });
    let accountType = 'user';

    // If not found in User, check Admin
    if (!account) {
      const admin = await Admin.findOne({ email });
      if (admin) {
        account = admin;
        accountType = admin.role === 'super_admin' ? 'super_admin' : 'admin';
      }
    }

    // If still not found
    if (!account) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    // Check if account is active
    if (account.isActive === false) {
      return res.status(403).json({ message: "Your account is inactive. Please contact support." });
    }

    // Compare the provided password
    const isPasswordValid = await bcrypt.compare(
      password,
      account.password
    );
    
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    // Generate JWT token
    const token = generateAccessToken(account, accountType); 

    // Check if COD is available for this user
    let codAvailable = true;
    let codRestrictionReason = "";
    if (accountType === 'user') {
      const [returnCount, cancelCount] = await Promise.all([
        Order.countDocuments({
          userId: account._id,
          orderStatus: { $in: ["RETURN", "RETURN_REQUESTED", "RETURNED"] }
        }),
        Order.countDocuments({
          userId: account._id,
          orderStatus: "CANCELLED"
        })
      ]);
      
      if (returnCount > 2) {
        codAvailable = false;
        codRestrictionReason = "Cash on Delivery is no longer available for your account due to excessive returns history.";
      } else if (cancelCount >= 2) {
        codAvailable = false;
        codRestrictionReason = "Cash on Delivery is no longer available for your account due to multiple cancelled orders.";
      }
    }

    res
      .status(200)
      .json({ 
        message: "Login successful", 
        user: { ...account.toObject(), codAvailable, codRestrictionReason }, 
        token,
        // Include admin-style data for compatibility if needed
        success: true,
        data: {
          id: account._id,
          email: account.email,
          role: account.role || 'user',
          token,
          codAvailable,
          codRestrictionReason
        }
      }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    if (!users) {
      res.status(201).json({ message: "User Not Found, pls Ceate a User" });
    } else {
      res.res.status(200).json({ message: "User Feching Successfully", users });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a user by ID
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.username = username || user.username;
    user.email = email || user.email;
    if (password) {
      user.password = await bcrypt.hash(password, 10); // Hash the new password
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Send OTP to mobile
export const sendOtp = async (req, res) => {

  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    
    // Format mobile number correctly
    const formattedMobile = formatMobileNumber(mobile);
    
    // Check if user exists (use original mobile for DB lookup)
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: "Your account is inactive. Please contact support." });
    }
    // console.log(user,":_____________-user");
    // Gen  erate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    
    // Store OTP with expiry (5 min)
    await redisClient.setEx(`otp:${mobile}`, 300, otp); // 5 min expiry

    const lastSent = await redisClient.get(`otp:sent:${mobile}`);
    if (lastSent) {
      return res.status(429).json({ message: 'Please wait before requesting another OTP.' });
    }
    
    // After sending OTP:
    await redisClient.setEx(`otp:sent:${mobile}`, 60, '1'); // 1 min cooldown

    // Send OTP via SMS using Twilio
    await twilioClient.messages.create({
      body: `Your OTP is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedMobile // Use formatted mobile number
    });

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Verify OTP and login
export const verifyOtp = async (req, res) => {

  try {
    const { mobile, otp } = req.body;
    console.log(mobile,":______rr_______-mobile");
    console.log(otp,":_____________-otp");
    if (!mobile || !otp) {
      return res.status(400).json({ message: 'Mobile and OTP are required' });
    }
    const storedOtp = await redisClient.get(`otp:${mobile}`);
    if (!storedOtp || storedOtp !== otp) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    await redisClient.del(`otp:${mobile}`); // Clean up
    // OTP is valid, log in the user
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Generate JWT token
    const token = generateAccessToken(user);

    // Check if COD is available for this user (less than or equal to 2 returns AND less than 2 cancellations)
    const [returnCount, cancelCount] = await Promise.all([
      Order.countDocuments({
        userId: user._id,
        orderStatus: { $in: ["RETURN", "RETURN_REQUESTED", "RETURNED"] }
      }),
      Order.countDocuments({
        userId: user._id,
        orderStatus: "CANCELLED"
      })
    ]);
    
    let codAvailable = true;
    let codRestrictionReason = "";

    if (returnCount > 2) {
      codAvailable = false;
      codRestrictionReason = "Cash on Delivery is no longer available for your account due to excessive returns history.";
    } else if (cancelCount >= 2) {
      codAvailable = false;
      codRestrictionReason = "Cash on Delivery is no longer available for your account due to multiple cancelled orders.";
    }

    res.status(200).json({ 
      message: 'Login successful', 
      user: { ...user.toObject(), codAvailable, codRestrictionReason }, 
      token 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Auto-create short-lived or background user for guest checkout
export const createGuestSession = async (req, res) => {
  try {
    const ownerId = req.headers['x-owner-id'] || req.body.ownerId || req.query.ownerId;
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Owner ID is required' });
    }

    const uid = uuidv4().split('-')[0];
    const dummyEmail = `guest_${uid}_${Date.now()}@guest.local`;
    const dummyMobile = Math.floor(1000000000 + Math.random() * 9000000000); // 10-digit random number
    
    // Hash dummy password
    const hashedPassword = await bcrypt.hash('guestPassword123!', 10);
    
    // Create new temporary user
    const newUser = new User({
      username: `Guest User`,
      email: dummyEmail,
      mobile: dummyMobile,
      password: hashedPassword,
      ownerId: ownerId,
      isActive: true,
      cart: { items: [], couponCode: null },
      wishlist: [],
      wallet: []
    });

    await newUser.save();

    // Generate token
    const token = generateAccessToken(newUser, "user");
    
    res.status(200).json({
      success: true,
      message: 'Guest session created successfully',
      user: newUser,
      token,
    });
  } catch (error) {
    console.error("Guest session error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
