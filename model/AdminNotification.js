import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["info", "success", "warning", "error"],
    default: "info",
  },
  category: {
    type: String,
    enum: ["owner_registration", "subscription", "order_alert", "system_alert"],
    default: "system_alert",
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-delete notifications older than 30 days
adminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.models.AdminNotification || mongoose.model("AdminNotification", adminNotificationSchema);
