import Subscription from "../../model/subscriptionModel.js";
import User from "../../model/usersModel.js";
import { createOrderRazorePay } from "../../middlewares/razorpay.js";
import Owner from "../../model/OwnerModels.js";
import SubscriptionPlan from "../../model/subscriptionPlans.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Create initial trial subscription for new owner


// Get subscription details
export const getSubscriptionDetails = asyncHandler(async (req, res) => {
  const subscriptions = await SubscriptionPlan.find();
  
  return res
    .status(200)
    .json(new ApiResponse(200, subscriptions, "Subscriptions fetched successfully"));
});

// Create subscription payment
// export const createSubscriptionPayment = asyncHandler(async (req, res) => {
//   const ownerId = req.user.id;
//   // Validate plan
//   if (!["BASIC", "PREMIUM", "ENTERPRISE"].includes(plan)) {
//     throw new ApiError(400, "Invalid plan selected");
//   }

//   // Get plan features and price
//   const planFeatures = Subscription.getPlanFeatures(plan);
//   let price = planFeatures.price;

//   // Apply billing cycle discount
//   if (billingCycle === "QUARTERLY") {
//     price = price * 3 * 0.9; // 10% discount for quarterly
//   } else if (billingCycle === "YEARLY") {
//     price = price * 12 * 0.8; // 20% discount for yearly
//   }

//   // Create Razorpay order
//   const razorpayOrder = await createOrderRazorePay(price, "INR");

//   if (!razorpayOrder || !razorpayOrder.id) {
//     throw new ApiError(500, "Failed to create payment order");
//   }

//   // Create subscription record
//   const startDate = new Date();
//   const endDate = new Date(startDate);

//   if (billingCycle === "MONTHLY") {
//     endDate.setMonth(endDate.getMonth() + 1);
//   } else if (billingCycle === "QUARTERLY") {
//     endDate.setMonth(endDate.getMonth() + 3);
//   } else if (billingCycle === "YEARLY") {
//     endDate.setFullYear(endDate.getFullYear() + 1);
//   }

//   const subscription = await Subscription.create({
//     ownerId,
//     plan,
//     status: "PENDING",
//     startDate,
//     endDate,
//     trialEndDate: startDate, // No trial for paid plans
//     billingCycle,
//     price,
//     features: planFeatures,
//   });

//   return res
//     .status(200)
//     .json(new ApiResponse(200, {
//       orderId: razorpayOrder.id,
//       amount: razorpayOrder.amount,
//       currency: razorpayOrder.currency,
//       key: process.env.RAZORPAY_KEY_ID,
//       subscriptionId: subscription._id,
//     }, "Payment order created successfully"));
// });

// // Verify and activate subscription
// export const verifySubscriptionPayment = asyncHandler(async (req, res) => {
//   const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
//   const { verifyPayment } = await import("../../middlewares/razorpay.js");

//   const isValid = verifyPayment(
//     razorpay_order_id,
//     razorpay_payment_id,
//     razorpay_signature
//   );

//   if (!isValid) {
//     throw new ApiError(400, "Invalid payment signature");
//   }

//   const subscription = await Subscription.findOne({
//     razorpayOrderId: razorpay_order_id,
//   });

//   if (!subscription) {
//     throw new ApiError(404, "Subscription not found");
//   }

//   // Update subscription status
//   subscription.status = "ACTIVE";
//   subscription.paymentMethod = "RAZORPAY";
//   subscription.lastPaymentId = razorpay_payment_id;
//   await subscription.save();

//   return res
//     .status(200)
//     .json(new ApiResponse(200, subscription, "Subscription activated successfully"));
// });

// Cancel subscription
export const cancelSubscription = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const { reason } = req.body;

  const subscription = await Subscription.findOne({ ownerId });
  if (!subscription) {
    throw new ApiError(404, "No subscription found");
  }

  subscription.status = "CANCELLED";
  subscription.autoRenew = false;
  subscription.cancellationReason = reason;
  await subscription.save();

  return res
    .status(200)
    .json(new ApiResponse(200, subscription, "Subscription cancelled successfully"));
});

// Create a new subscription plan
export const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    features
  } = req.body;


  // Validate required fields
  if (!name || !description || !price || !features) {
    throw new ApiError(400, "All fields are required");
  }

  // Validate price structure
  if (!price.monthly && !price.quarterly && !price.yearly) {
    throw new ApiError(400, "At least one price option must be provided");
  }

  // Validate features
  if (!features.maxUsers || !features.maxProducts) {
    throw new ApiError(400, "User and product limits are required");
  }

  // Check if plan already exists
  const existingPlan = await SubscriptionPlan.findOne({ name: name.toUpperCase() });
  if (existingPlan) {
    throw new ApiError(409, "Subscription plan with this name already exists");
  }

  // Create new plan
  const plan = await SubscriptionPlan.create({
    name,
    description,
    price: {
      monthly: price.monthly || 0,
      quarterly: price.quarterly || 0,
      yearly: price.yearly || 0
    },
    features: {
      maxUsers: features.maxUsers,
      maxProducts: features.maxProducts,
      analytics: features.analytics || false,
      customDomain: features.customDomain || false,
      prioritySupport: features.prioritySupport || false,
      apiAccess: features.apiAccess || false,
      whiteLabel: features.whiteLabel || false
    },
    createdBy: req.user.id
  });

  return res
    .status(201)
    .json(new ApiResponse(201, plan, "Subscription plan created successfully"));
});

// Get all subscription plans
export const getAllSubscriptionPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true })
    .sort({ 'price.monthly': 1 });

  return res
    .status(200)
    .json(new ApiResponse(200, plans, "Subscription plans retrieved successfully"));
});

// Get subscription plan by name
export const getSubscriptionPlanByName = asyncHandler(async (req, res) => {
  const { name } = req.params;

  const plan = await SubscriptionPlan.findOne({ 
    name: name.toUpperCase(),
    isActive: true 
  });

  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, plan, "Subscription plan retrieved successfully"));
});

// Update subscription plan
// export const updateSubscriptionPlan = asyncHandler(async (req, res) => {
//   const { name } = req.params;
//   const updateData = req.body;

//   const plan = await SubscriptionPlan.findOne({ name: name.toUpperCase() });
//   if (!plan) {
//     throw new ApiError(404, "Subscription plan not found");
//   }

//   // Update only provided fields
//   if (updateData.description) plan.description = updateData.description;
//   if (updateData.price) {
//     plan.price = {
//       ...plan.price,
//       ...updateData.price
//     };
//   }
//   if (updateData.features) {
//     plan.features = {
//       ...plan.features,
//       ...updateData.features
//     };
//   }

//   await plan.save();

//   return res
//     .status(200)
//     .json(new ApiResponse(200, plan, "Subscription plan updated successfully"));
// });

// Delete subscription plan (soft delete)
export const deleteSubscriptionPlan = asyncHandler(async (req, res) => {
  const { name } = req.params;

  const plan = await SubscriptionPlan.findOne({ name: name.toUpperCase() });
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found");
  }

  plan.isActive = false;
  await plan.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription plan deleted successfully"));
});
