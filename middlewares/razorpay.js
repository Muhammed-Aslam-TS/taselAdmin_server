import Razorpay from "razorpay";
import crypto from "crypto";

export const createOrderRazorePay = async (
  key_id,
  key_secret,
  amount,
  currency = "INR"

) => {
  const razorpay = new Razorpay({
    key_id: key_id,
    key_secret: key_secret,
  });

  console.log(key_id, key_secret, amount, currency, "0000000000 vvvvaaaaa");
  
  const options = {
    amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
    currency,
    payment_capture: 1,
    receipt: `receipt_${Date.now()}`,
  };
  return await razorpay.orders.create(options);
};

export const verifyPayment = (orderId, paymentId, signature, secret) => {
  // const razorePay_key_id = awit Owner
  const body = orderId + "|" + paymentId;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body.toString())
    .digest("hex");
  return expectedSignature === signature;
};
