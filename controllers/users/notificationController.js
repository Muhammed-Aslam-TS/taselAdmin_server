import Notification from "../../model/notificationModel.js";
import Offer from "../../model/OfferModel.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail", // Or use 'smtp.mailtrap.io', etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app-specific password
  },
});

// Helper to send email
const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`📧 Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
  }
};

// Subscribe to a flash sale notification
export const subscribeToFlashSale = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.id;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required", success: false });
    }

    const now = new Date();
    
    // Find the upcoming flash sale for this product
    const offer = await Offer.findOne({
      isActive: true,
      offerTimeType: "flash_sale",
      productId: productId,
      startTime: { $gt: now },
    });

    if (!offer) {
      return res.status(400).json({ message: "No upcoming flash sale found for this product.", success: false });
    }

    // Check if already subscribed
    const existingSubscription = await Notification.findOne({
      productId,
      status: "pending",
      type: "flash_sale_start",
      userId,
    });

    if (existingSubscription) {
      return res.status(200).json({ message: "You are already subscribed to be notified.", success: true });
    }

    // Create subscription
    await Notification.create({
      productId,
      scheduledTime: offer.startTime,
      type: "flash_sale_start",
      userId,
    });

    res.status(200).json({ message: "You will be notified when the sale starts!", success: true });
  } catch (error) {
    console.error("Subscribe error:", error);
    res.status(500).json({ message: "Failed to subscribe to notifications.", success: false });
  }
};

// NOTE: This function should be called by a CRON job (e.g., every minute)
export const processScheduledNotifications = async () => {
  try {
    const now = new Date();
    // 1. Find pending notifications where scheduledTime <= now
    const pending = await Notification.find({ scheduledTime: { $lte: now }, status: 'pending' }).populate('userId productId');
    
    // 2. Loop through and send emails/SMS using your preferred service (Nodemailer/Twilio)
    for (const notif of pending) {
       if (notif.userId?.email) {
         const subject = "⚡ Flash Sale Started!";
         const message = `Hi ${notif.userId.username || 'there'},\n\nThe flash sale for "${notif.productId?.name}" has just started! Hurry up and grab it before it's gone.\n\nHappy Shopping!`;
         
         await sendEmail(notif.userId.email, subject, message);
       }
       
       notif.status = 'sent';
       await notif.save();
    }
  } catch (error) {
    console.error("Error processing notifications:", error);
  }
};