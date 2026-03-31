import Subscription from "../../model/subscriptionModel.js";
import Owner from "../../model/OwnerModels.js";
import SubscriptionPlan from "../../model/subscriptionPlans.js";
import {
  createOrderRazorePay,
  verifyPayment,
} from "../../middlewares/razorpay.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getOwnerSubscription = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const subscription = await Subscription.findOne({ ownerId });
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No subscription found",
      });
    }

    // Check if trial has expired
    const now = new Date();
    if (subscription.status === "TRIAL" && now > subscription.endDate) {
      subscription.status = "EXPIRED";
      subscription.isTrial = false;
      await subscription.save();

      await Owner.findByIdAndUpdate(ownerId, {
        isSubscription: false,
        isActive: false,
      });
    }

    // Get days remaining
    const trialDaysRemaining = subscription.getTrialDaysRemaining();
    const subscriptionDaysRemaining = subscription.getDaysRemaining();

    res.status(200).json({
      success: true,
      data: {
        ...subscription.toObject(),
        trialDaysRemaining,
        subscriptionDaysRemaining,
        isActive: subscription.isActive(),
        isInTrial: subscription.isInTrial(),
      },
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching subscription details",
      error: error.message,
    });
  }
};

// Initialize Razorpay payment for subscription
export const initializeSubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    amount,
    currency,
    name,
    description,
    email,
    phone,
    planId,
    planName,
    duration,
    planFeatures,
    planDescription,
    paymentType,
  } = req.body;

  const ownerId = req.user.id;

  // Validate required fields
  if (!amount || !planName || !duration || !name || !email || !phone) {
    throw new ApiError(
      400,
      "Missing required fields: amount, planName, duration, name, email, and phone are required"
    );
  }

  // Validate plan name
  if (!["BASIC", "PREMIUM", "ENTERPRISE"].includes(planName.toUpperCase())) {
    throw new ApiError(
      400,
      "Invalid plan selected. Must be one of: BASIC, PREMIUM, ENTERPRISE"
    );
  }

  // Validate duration
  if (!["monthly", "quarterly", "yearly"].includes(duration.toLowerCase())) {
    throw new ApiError(
      400,
      "Invalid duration. Must be one of: monthly, quarterly, yearly"
    );
  }

  // Validate amount
  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(500, "Razorpay configuration missing on server");
  }

  // Get plan details
  console.log(`[Subscription DEBUG] Looking for plan: "${planName}" (normalized: "${planName.toUpperCase()}")`);
  const plan = await SubscriptionPlan.findOne({
    name: planName.toUpperCase(),
    isActive: true,
  });

  if (!plan) {
    const availablePlans = await SubscriptionPlan.find({ isActive: true }).distinct('name');
    console.error(`[Subscription DEBUG] Plan not found: "${planName.toUpperCase()}". Available: ${availablePlans.join(', ')}`);
    throw new ApiError(404, `Subscription plan "${planName.toUpperCase()}" not found in database. Available plans: ${availablePlans.join(', ')}`);
  }
  console.log(`[Subscription DEBUG] Plan found: ${plan.name}, Price: ${plan.price[duration.toLowerCase()]}`);

  // Create Razorpay order
  const razorpayOrder = await createOrderRazorePay(
    process.env.RAZORPAY_KEY_ID,
    process.env.RAZORPAY_KEY_SECRET,
    amount,
    currency || "INR"
  );

  if (!razorpayOrder || !razorpayOrder.id) {
    throw new ApiError(500, "Failed to create payment order");
  }

  // Calculate subscription dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  //   endDate.setMonth(endDate.getMonth() + 2);

  switch (duration.toLowerCase()) {
    case "monthly":
      endDate.setMonth(endDate.getMonth() + 1);
      break;
    case "quarterly":
      endDate.setMonth(endDate.getMonth() + 3);
      break;
    case "yearly":
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;
  }

  // Check for existing subscription
  let subscription = await Subscription.findOne({ ownerId });

  if (subscription) {
    // Update existing subscription
    subscription = await Subscription.findOneAndUpdate(
      { ownerId },
      {
        plan: planName.toUpperCase(),
        status: "PENDING",
        startDate,
        endDate,
        billingCycle: duration.toUpperCase(),
        price: amount,
        features: planFeatures || plan.features,
        razorpayOrderId: razorpayOrder.id,
        paymentDetails: {
          name,
          email,
          phone,
          description,
          paymentType,
        },
        isTrial: false,
      },
      { new: true }
    );
  } else {
    // Create new subscription
    subscription = await Subscription.create({
      ownerId,
      plan: planName.toUpperCase(),
      status: "PENDING",
      startDate,
      endDate,
      billingCycle: duration.toUpperCase(),
      price: amount,
      features: planFeatures || plan.features,
      razorpayOrderId: razorpayOrder.id,
      paymentDetails: {
        name,
        email,
        phone,
        description,
        paymentType,
      },
      isTrial: false,
    });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
        subscriptionId: subscription._id,
        plan: planName.toUpperCase(),
        duration: duration.toLowerCase(),
        features: planFeatures || plan.features,
        customer: {
          name,
          email,
          phone,
        },
      },
      "Payment initialized successfully"
    )
  );
});

// Verify Razorpay payment and activate subscription
export const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentId, signature, subscriptionId, planName } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  // Validate required fields
  if (!orderId || !paymentId || !signature || !subscriptionId || !secret) {
    throw new ApiError(400, "Missing required fields");
  }
  // Verify payment signature
  const isValid = verifyPayment(orderId, paymentId, signature, secret);

  if (!isValid) {
    throw new ApiError(400, "Invalid payment signature");
  }

  // Find subscription
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    razorpayOrderId: orderId,
  });

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  // Update subscription status
  subscription.status = "ACTIVE";
  subscription.paymentMethod = "RAZORPAY";
  subscription.lastPaymentId = paymentId;
  subscription.plan = planName.toUpperCase();
  subscription.isTrial = false;

  subscription.paymentDetails = {
    orderId: orderId,
    paymentId: paymentId,
    signature: signature,
  };
  await subscription.save();

  // Update owner's subscription status
  const updatedOwner = await Owner.findByIdAndUpdate(
    subscription.ownerId,
    {
      isSubscription: true,
      $set: {
        planName: subscription.plan,
        SubscriptionStartTime: subscription.startDate,
        SubscriptionEndTime: subscription.endDate,
      },
    },
    { new: true }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscription,
        owner: updatedOwner,
      },
      "Payment verified and subscription activated successfully"
    )
  );
});

// Get subscription details
export const getSubscriptionDetails = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;

  const subscription = await Subscription.findOne({ ownerId }).sort({
    createdAt: -1,
  });

  if (!subscription) {
    throw new ApiError(404, "No subscription found");
  }

  // Get plan details
  const plan = await SubscriptionPlan.findOne({
    name: subscription.plan,
    isActive: true,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscription,
        plan,
        daysRemaining: Math.ceil(
          (subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
        ),
      },
      "Subscription details retrieved successfully"
    )
  );
});

// Cancel subscription
export const cancelSubscription = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const { reason } = req.body;

  const subscription = await Subscription.findOne({
    ownerId,
    status: "ACTIVE",
  });

  if (!subscription) {
    throw new ApiError(404, "No active subscription found");
  }

  subscription.status = "CANCELLED";
  subscription.autoRenew = false;
  subscription.cancellationReason = reason;
  subscription.cancelledAt = new Date();
  await subscription.save();

  // Update owner's subscription status
  await Owner.findByIdAndUpdate(ownerId, {
    isSubscription: false,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscription, "Subscription cancelled successfully")
    );
});

export const updateSubscriptionPlan = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const updateData = req.body;
  const plan = await SubscriptionPlan.findOne({ name: name.toUpperCase() });
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  // Update only provided fields
  if (updateData.description) plan.description = updateData.description;
  if (updateData.price) {
    plan.price = {
      ...plan.price,
      ...updateData.price,
    };
  }
  if (updateData.features) {
    plan.features = {
      ...plan.features,
      ...updateData.features,
    };
  }

  await plan.save();

  return res
    .status(200)
    .json(new ApiResponse(200, plan, "Subscription plan updated successfully"));
});
