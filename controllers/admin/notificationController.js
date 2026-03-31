import { sendSMS, sendWhatsApp } from "../../services/notificationService.js";
import Owner from "../../model/OwnerModels.js";
import AdminNotification from "../../model/AdminNotification.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * Send a notification to a specific phone number
 */
export const sendDirectNotification = asyncHandler(async (req, res) => {
  const { phone, message, type = "sms" } = req.body;

  if (!phone || !message) {
    throw new ApiError(400, "Phone and message are required");
  }

  let result;
  if (type === "whatsapp") {
    result = await sendWhatsApp(phone, message);
  } else {
    result = await sendSMS(phone, message);
  }

  if (!result.sent) {
    throw new ApiError(500, result.reason || "Failed to send notification");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Notification sent successfully"));
});

/**
 * Send a bulk notification to all registered owners
 */
export const sendBulkOwnerNotification = asyncHandler(async (req, res) => {
  const { message, type = "sms" } = req.body;

  if (!message) {
    throw new ApiError(400, "Message is required");
  }

  const owners = await Owner.find({ isActive: true, mobile: { $exists: true, $ne: "" } });
  
  if (owners.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "No active owners with phone numbers found"));
  }

  const results = [];
  for (const owner of owners) {
    let res;
    if (type === "whatsapp") {
      res = await sendWhatsApp(owner.mobile, message);
    } else {
      res = await sendSMS(owner.mobile, message);
    }
    results.push({ ownerId: owner._id, email: owner.email, ...res });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, results, `Bulk notification processing finished for ${owners.length} owners`));
});

/**
 * Get all system notifications for Admin Dashboard
 */
export const getAdminNotifications = asyncHandler(async (req, res) => {
  const { limit = 20, page = 1, category, isRead } = req.query;
  
  const query = {};
  if (category) query.category = category;
  if (isRead !== undefined) query.isRead = isRead === 'true';

  const notifications = await AdminNotification.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await AdminNotification.countDocuments(query);

  return res
    .status(200)
    .json(new ApiResponse(200, {
      notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    }, "Admin notifications fetched successfully"));
});

/**
 * Mark a notification as read
 */
export const markAdminNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await AdminNotification.findByIdAndUpdate(
    id,
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, notification, "Notification marked as read"));
});

/**
 * Delete a notification
 */
export const deleteAdminNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await AdminNotification.findByIdAndDelete(id);

  if (!result) {
    throw new ApiError(404, "Notification not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Notification deleted successfully"));
});
