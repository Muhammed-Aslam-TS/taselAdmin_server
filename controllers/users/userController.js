import { createTrialSubscription } from "../owner/subscriptionController.js";

// Register owner
export const registerOwner = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: "owner",
    });

    // Create trial subscription
    await createTrialSubscription(user._id);

    // Generate token
    const token = user.getJwtToken();

    res.status(201).json({
      success: true,
      message: "Owner registered successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Error registering owner:", error);
    res.status(500).json({
      success: false,
      message: "Error registering owner",
      error: error.message,
    });
  }
}; 