import axios from "axios";
import crypto from "crypto";

const CASHFREE_BASE_URL = process.env.NODE_ENV === "production" 
  ? "https://api.cashfree.com/pg" 
  : "https://sandbox.cashfree.com/pg";

/**
 * Create a Cashfree order
 * @param {string} clientId 
 * @param {string} clientSecret 
 * @param {object} orderData 
 * @returns {Promise<object>}
 */
export const createCashfreeOrder = async (clientId, clientSecret, orderData, mode = 'sandbox') => {
  
  // Auto-detect production mode if secret key starts with 'cfsk_ma_prod'
  if (clientSecret && clientSecret.startsWith('cfsk_ma_prod') && mode !== 'production') {
    console.warn("⚠️ Detected Production Key but mode is Sandbox. Switching to Production.");
    mode = 'production';
  }

  const isProduction = mode === 'production';
  const baseUrl = isProduction ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  const apiVersion = "2023-08-01";

  // Construct payload strictly according to docs
  const payload = {
    order_id: String(orderData.orderId),
    order_amount: Number(orderData.amount),
    order_currency: orderData.currency || "INR",
    customer_details: {
      customer_id: String(orderData.customerId),
      customer_email: orderData.customerEmail,
      customer_phone: String(orderData.customerPhone),
      customer_name: orderData.customerName || "Customer",
    },
    order_meta: {
      return_url: orderData.returnUrl || `${process.env.FRONTEND_URL}/payment-status?order_id={order_id}`,
    }
  };

  try {
    const response = await axios.post(
      `${baseUrl}/orders`,
      payload,
      {
        headers: {
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
          "x-api-version": apiVersion,
          "Content-Type": "application/json",
        },
      }
    );
    return { ...response.data, mode };
  } catch (error) {
    const errorData = error.response?.data;
    console.error("❌ Cashfree Error:", errorData || error.message);
    
    // Throw a more informative error
    const msg = errorData?.message || errorData?.data?.message || "Cashfree order creation failed";
    const type = errorData?.type || "unknown";
    throw new Error(`${msg} (${type})`);
  }
};

/**
 * Verify Cashfree payment signature
 * @param {string} orderId 
 * @param {string} paymentSessionId 
 * @param {string} clientId 
 * @param {string} clientSecret 
 * @returns {Promise<object>}
 */
export const verifyCashfreePayment = async (orderId, clientId, clientSecret, mode = 'sandbox') => {
  const isProduction = mode === 'production';
  const baseUrl = isProduction ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  
  try {
    const response = await axios.get(
      `${baseUrl}/orders/${orderId}`,
      {
        headers: {
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
          "x-api-version": "2023-08-01",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Cashfree Payment Verification Error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || "Failed to verify Cashfree payment");
  }
};
