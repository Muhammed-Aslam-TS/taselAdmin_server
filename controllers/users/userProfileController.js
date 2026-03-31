import User from "../../model/usersModel.js";
import Order from "../../model/orderModel.js";

/**
 * Get current user profile
 * GET /api/user/profile
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if COD is available for this user
    const [returnCount, cancelCount] = await Promise.all([
      Order.countDocuments({
        userId,
        orderStatus: { $in: ["RETURN", "RETURN_REQUESTED", "RETURNED"] }
      }),
      Order.countDocuments({
        userId,
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
      success: true,
      user: {
        ...user.toObject(),
        codAvailable,
        codRestrictionReason
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Update current user profile
 * PUT /api/user/profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, mobile } = req.body;

    // Check if user exists
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if new email/mobile is already in use by another user
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: userId } });
      if (emailExists) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
      user.email = email;
    }

    if (mobile && mobile !== user.mobile) {
      const mobileExists = await User.findOne({ mobile, _id: { $ne: userId } });
      if (mobileExists) {
        return res.status(400).json({ success: false, message: "Mobile number already in use" });
      }
      user.mobile = mobile;
    }

    if (username) user.username = username;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: user,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
