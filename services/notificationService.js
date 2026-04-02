import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioSmsFrom = process.env.TWILIO_SMS_FROM || ""; // E.g., +15005550006 (Twilio trial/test from)
const twilioWhatsappFrom = process.env.TWILIO_WHATSAPP_FROM || ""; // E.g., whatsapp:+14155238886

let twilioClient = null;
if (twilioAccountSid && twilioAuthToken) {
  // Check if the values are placeholders or invalid
  const isPlaceholder = twilioAccountSid.includes("your_twilio_account_sid") || !twilioAccountSid.startsWith("AC");
  
  if (isPlaceholder) {
    console.warn("[NotificationService] Twilio is not configured: TWILIO_ACCOUNT_SID is a placeholder or invalid. SMS/WhatsApp features will be disabled.");
  } else {
    try {
      twilioClient = twilio(twilioAccountSid, twilioAuthToken);
      console.log("[NotificationService] Twilio client initialized successfully.");
    } catch (err) {
      console.error("[NotificationService] Failed to initialize Twilio client:", err.message);
      twilioClient = null;
    }
  }
} else {
  console.warn("[NotificationService] Twilio credentials missing in .env. SMS/WhatsApp features will be disabled.");
}



function sanitizePhoneE164(phone) {
  if (!phone) return null;
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || "+91").trim();
  const ensurePlus = (cc) => (cc.startsWith("+") ? cc : `+${cc}`);

  const raw = String(phone).trim();
  if (raw.startsWith("+")) {
    return raw;
  }

  // Strip all non-digits
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return null;

  // Convert 00-prefix to + (international format like 0091...)
  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  // Remove leading 0 for local formats like 0XXXXXXXXXX
  if (/^0\d{10}$/.test(digits)) {
    digits = digits.slice(1);
  }

  // If 11-15 digits, assume it already includes country code
  if (/^\d{11,15}$/.test(digits)) {
    return `+${digits}`;
  }

  // If 10 digits, prefix default country code
  if (/^\d{10}$/.test(digits)) {
    return `${ensurePlus(defaultCountryCode)}${digits}`;
  }

  // Fallback: if still 11-15 digits after transformations
  if (/^\d{11,15}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

export async function sendSMS(toPhone, body) {
    console.log(`[NotificationService] Sending SMS to: ${toPhone}`);
    
  if (!twilioClient || !twilioSmsFrom) return { sent: false, reason: "Twilio SMS not configured" };
  const to = sanitizePhoneE164(toPhone);
  if (!to) return { sent: false, reason: "Invalid recipient phone" };
  try {
    const res = await twilioClient.messages.create({
      to,
      from: twilioSmsFrom,
      body,
    });
    return { sent: true, sid: res.sid };
  } catch (err) {
    return { sent: false, reason: err?.message || "SMS send failed" };
  }
}

export async function sendWhatsApp(toPhone, body) {
  if (!twilioClient || !twilioWhatsappFrom) return { sent: false, reason: "Twilio WhatsApp not configured" };
  const e164 = sanitizePhoneE164(toPhone);
  if (!e164) return { sent: false, reason: "Invalid recipient phone" };
  const to = `whatsapp:${e164}`;
  try {
    const res = await twilioClient.messages.create({
      to,
      from: twilioWhatsappFrom,
      body,
    });
    return { sent: true, sid: res.sid };
  } catch (err) {
    return { sent: false, reason: err?.message || "WhatsApp send failed" };
  }
}

// Placeholder email sender – can be implemented via nodemailer later
export async function sendEmail(/* to, subject, html */) {
  return { sent: false, reason: "Email not configured" };
}

export function buildOrderMessage({ greetingName, orderNumber, amount, status }) {
  const safeName = greetingName || "Customer";
  const safeStatus = status || "PENDING";
  const safeAmount = typeof amount === "number" ? amount.toFixed(2) : amount;
  return `Dear ${safeName}, your order ${orderNumber} of Rs ${safeAmount} is ${safeStatus}. Thank you for shopping with us.`;
}

export async function sendOrderNotifications({
  user,
  order,
  channels = { sms: true, whatsapp: true, email: false },
  overrideMessage,
}) {
  const message =
    overrideMessage ||
    buildOrderMessage({
      greetingName: user?.name || user?.firstName || user?.email || "Customer",
      orderNumber: order?.orderNumber || order?._id,
      amount: order?.totalAmount,
      status: order?.orderStatus || order?.paymentStatus || "PENDING",
    });

  const results = {};

  if (channels.sms) {
    results.sms = await sendSMS(user?.mobile, message);
  }

  if (channels.whatsapp) {
    results.whatsapp = await sendWhatsApp(user?.mobile, message);
  }

  if (channels.email) {
    results.email = await sendEmail(user?.email,message);
  }

  console.log(`[NotificationService] Notification results:`, results);
  return results;
}


export default {
  sendSMS,
  sendWhatsApp,
  sendEmail,
  sendOrderNotifications,
  buildOrderMessage,
};


