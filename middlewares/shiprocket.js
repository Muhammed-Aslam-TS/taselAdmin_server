import axios from "axios";
import dotenv from "dotenv";
import Owner from "../model/OwnerModels.js";
import User from "../model/usersModel.js";
import Order from "../model/orderModel.js";

dotenv.config();

// Defaults for package dimensions (can be overridden via environment variables)
const DEFAULT_PACKAGE_LENGTH =
  parseFloat(process.env.SHIPROCKET_DEFAULT_LENGTH) || 10;
const DEFAULT_PACKAGE_BREADTH =
  parseFloat(process.env.SHIPROCKET_DEFAULT_BREADTH) || 10;
const DEFAULT_PACKAGE_HEIGHT =
  parseFloat(process.env.SHIPROCKET_DEFAULT_HEIGHT) || 10;
const DEFAULT_PACKAGE_WEIGHT =
  parseFloat(process.env.SHIPROCKET_DEFAULT_WEIGHT) || 1; // in kg

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

/**
 * Get the first valid channel ID for the account
 */
const getShiprocketChannels = async (token) => {
  try {
    const response = await axios.get(`${SHIPROCKET_BASE_URL}/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // API returns { data: [ { id: 123, name: 'Shopify' }, ... ] }
    const channels = response.data?.data;
    if (Array.isArray(channels) && channels.length > 0) {
      // Prefer 'Custom' or 'Manual' if available, otherwise take the first one
      const custom = channels.find(
        (c) =>
          c.name.toLowerCase().includes("custom") ||
          c.name.toLowerCase().includes("manual"),
      );
      return custom ? custom.id : channels[0].id;
    }
    return null;
  } catch (error) {
    console.warn("⚠️ Failed to fetch Shiprocket channels:", error.message);
    return null;
  }
};

/**
 * Get the first valid pickup location
 */
/**
 * Get the first valid pickup location
 */
const getPickupLocation = async (token) => {
  try {
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/settings/company/pickup`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    // API returns { data: { shipping_address: [ ... ] } }
    const locations = response.data?.data?.shipping_address;
    if (Array.isArray(locations) && locations.length > 0) {
      // Return the pickup_location code of the first valid location (or filter by primary/status)
      // Usually the first one is a safe default
      // Important: Must return the 'pickup_location' field, which is the nick name
      return locations[0].pickup_location;
    }
    return null; // No location found
  } catch (error) {
    console.warn("⚠️ Failed to fetch pickup locations:", error.message);
    return null;
  }
};

/**
 * Login to Shiprocket using Owner's credentials from DB
 * @param {string} ownerId - The owner's ID
 * @returns {Promise<string>} - Auth token
 */
export const shiprocketLogin = async (ownerId) => {
  try {
    if (!ownerId) {
      throw new Error("Owner ID is required for Shiprocket login");
    }

    const owner = await Owner.findById(ownerId).select(
      "+shiprocketEmail +shiprocketPassword",
    );
  console.log(owner, "ownerId");

    if (!owner) {
      throw new Error("Owner not found for Shiprocket authentication");
    }

    // Fallback logic for email: prioritizes shiprocketEmail, then warehouseAddress email, then primary email
    const email = owner.shiprocketEmail || owner.warehouseAddress?.email || owner.email;
    const password = owner.shiprocketPassword;

    if (!email || !password) {
      throw new Error(
        "Shiprocket credentials (email/password) not configured for this store owner",
      );
    }

    const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email,
      password,
    });

    if (!response.data?.token) {
      throw new Error("Failed to receive token from Shiprocket");
    }

    return { token: response.data.token, owner };
  } catch (error) {
    console.error(
      "❌ Shiprocket login failed:",
      error.response?.data || error.message,
    );
    throw new Error(
      `Shiprocket login failed: ${error.response?.data?.message || error.message}`,
    );
  }
};

/* ==================================================
  CREATE SHIPROCKET ORDER (For User/System triggered events)
  Resolves Owner from Order -> User -> Owner relationship
================================================== */
export const createShiprocketOrder = async (orderData) => {
  try {
    // 1. Get Owner ID from Order -> User -> Owner
    let ownerId = null;
    if (
      orderData.userId &&
      typeof orderData.userId === "object" &&
      orderData.userId.ownerId
    ) {
      ownerId = orderData.userId.ownerId;
    } else if (orderData.userId) {
      const user = await User.findById(orderData.userId);
      if (user) ownerId = user.ownerId;
    }

    if (!ownerId) {
      console.warn(
        "Could not determine store owner for this order - Shiprocket creation skipped",
      );
      return { success: false, message: "Store owner context missing" };
    }

    // 2. Login & Owner Info
    const { token, owner } = await shiprocketLogin(ownerId);

    // 3. Get valid metadata
    const channelId =
      (await getShiprocketChannels(token)) ||
      process.env.SHIPROCKET_CHANNEL_ID ||
      "7738621";

    // Prioritize DB pickup nickname as requested by user
    const pickupLocation = owner?.warehouseAddress?.pickupLocation
      ? owner.warehouseAddress.pickupLocation.trim()
      : await getPickupLocation(token);

    if (!pickupLocation) {
      throw new Error(
        "No configured pickup location found. Please provide a pickup nickname in settings.",
      );
    }

    console.log(
      `📦 Creating Shiprocket Order. Channel: ${channelId}, Pickup: ${pickupLocation} (Owner: ${ownerId})`,
    );

    const {
      orderNumber,
      userEmail,
      shippingAddress,
      items,
      totalAmount,
      paymentMethod,
    } = orderData;

    const sanitize = (value, fallback) => {
      if (value === null || value === undefined) return fallback;
      if (typeof value === "number") value = String(value);
      if (typeof value === "string" && value.trim() !== "") return value.trim();
      return fallback;
    };

    const orderItems = items.map((item) => ({
      name: sanitize(item.product_name || item.name, "Product"),
      sku: sanitize(item.productId?.toString() || item._id || item.sku, "SKU"),
      units: parseInt(item.quantity || item.units || 1),
      selling_price: parseFloat(item.price || item.selling_price || 0),
    }));

    const computedWeight = items.reduce((sum, it) => {
      const unitCount = parseInt(it.quantity || it.units || 1);
      const unitWeight =
        parseFloat(it.weight || it.unit_weight || it.selling_weight || 0) || 0;
      return sum + unitWeight * unitCount;
    }, 0);

    const weight =
      computedWeight > 0
        ? Math.max(0.01, Math.round(computedWeight * 100) / 100)
        : DEFAULT_PACKAGE_WEIGHT;

    const normalizePhone = (rawPhone, country = "IN") => {
      if (!rawPhone) return null;
      let s = String(rawPhone).replace(/\D+/g, "");
      if (s.length === 10 && country === "IN") return "91" + s;
      if (s.length === 11 && s.startsWith("0") && country === "IN")
        return "91" + s.slice(1);
      if (s.length >= 11 && s.length <= 15) return s;
      return null;
    };

    const payload = {
      order_id: orderNumber,
      order_date: new Date().toISOString().split("T")[0],
      pickup_location: pickupLocation,
      channel_id: channelId,
      comment: "Online order placed via website",
      billing_customer_name: sanitize(shippingAddress?.firstName, "Customer"),
      billing_last_name: sanitize(shippingAddress?.lastName, ""),
      billing_address: sanitize(shippingAddress?.address, "Default Address"),
      billing_city: sanitize(shippingAddress?.city, "Default City"),
      billing_pincode: sanitize(
        shippingAddress?.zipCode || shippingAddress?.pincode,
        "560001",
      ),
      billing_state: sanitize(shippingAddress?.state, "Karnataka"),
      billing_country: sanitize(shippingAddress?.country, "India"),
      billing_email: sanitize(userEmail, "support@example.com"),
      billing_phone:
        normalizePhone(sanitize(shippingAddress?.phone, "9999999999")) ||
        sanitize(shippingAddress?.phone, "9999999999"),
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method:
        paymentMethod === "COD" || paymentMethod === "CASH" ? "COD" : "Prepaid",
      sub_total: totalAmount,
      length: DEFAULT_PACKAGE_LENGTH,
      breadth: DEFAULT_PACKAGE_BREADTH,
      height: DEFAULT_PACKAGE_HEIGHT,
      weight: weight,
      ...(orderData.courierId ? { courier_id: orderData.courierId } : {}),
    };

    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/create/adhoc`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.data || (!response.data.shipment_id && !response.data.order_id)) {
      console.error(
        "❌ Shiprocket Order API Error (No shipment_id):",
        JSON.stringify(response.data, null, 2),
      );
      throw new Error(
        response.data?.message ||
          (response.data?.errors ? JSON.stringify(response.data.errors) : "Failed to create Shiprocket order"),
      );
    }
    console.log("✅ Shiprocket order created successfully:", response.data);
    
    // Auto-fetch available delivery partners
    let availableCouriers = [];
    try {
      const shipmentId = response.data.shipment_id || null;
      const internalOrderId = response.data.order_id || null;
      if (shipmentId || internalOrderId) {
        const srService = (await import('../services/shiprocketService.js')).default;
        const serviceability = await srService.getShipmentServiceability(shipmentId, ownerId, internalOrderId);
        if (serviceability.success) {
          availableCouriers = serviceability.availableCouriers;
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to auto-fetch couriers in middleware:", e.message);
    }

    return { 
      success: true, 
      data: response.data,
      availableCouriers: availableCouriers 
    };
  } catch (error) {
    const respData = error.response?.data;
    console.error(
      "❌ Shiprocket order error:",
      respData ? JSON.stringify(respData, null, 2) : error.message,
    );
    return {
      success: false,
      message:
        respData?.message ||
        error.message ||
        "Shiprocket order creation failed",
      data: respData || null,
    };
  }
};

/* ==================================================
  CREATE SHIPROCKET ORDER FOR OWNER (Manual/Admin Panel)
  Uses explicitly provided ownerId (from authenticated session)
================================================== */
export const createShiprocketOrderForOwner = async (orderData, ownerId) => {
  try {
    if (!ownerId)
      throw new Error("Owner ID is missing for manual order creation");

    // Login & Owner Info
    const { token, owner } = await shiprocketLogin(ownerId);

    // Get metadata
    const channelId =
      (await getShiprocketChannels(token)) ||
      process.env.SHIPROCKET_CHANNEL_ID ||
      "7738621";

    // Prioritize DB pickup nickname as requested by user
    const pickupLocation = owner?.warehouseAddress?.pickupLocation
      ? owner.warehouseAddress.pickupLocation.trim()
      : await getPickupLocation(token);

    console.log(
      `📦 Manual Shiprocket Order - Channel: ${channelId}, Pickup: ${pickupLocation} (Owner: ${ownerId})`,
    );

    const {
      orderNumber,
      userEmail,
      shippingAddress,
      items,
      totalAmount,
      paymentMethod,
    } = orderData;

    const sanitize = (val, fb) =>
      val === null || val === undefined || val === "" ? fb : String(val).trim();

    const normalizePhone = (raw) => {
      let s = String(raw || "").replace(/\D+/g, "");
      if (s.length === 10) return "91" + s;
      if (s.length === 11 && s.startsWith("0")) return "91" + s.slice(1);
      return s;
    };

    const orderItems = items.map((item) => ({
      name: sanitize(item.product_name || item.name, "Product"),
      sku: sanitize(item.sku || item.productId, "SKU"),
      units: parseInt(item.quantity || 1),
      selling_price: parseFloat(item.price || 0),
    }));

    // Weight calculation
    const computedWeight = items.reduce((sum, it) => {
      const u = parseInt(it.quantity || 1);
      const w = parseFloat(it.weight || 0);
      return sum + w * u;
    }, 0);
    const finalWeight =
      computedWeight > 0
        ? Math.max(0.01, Math.round(computedWeight * 100) / 100)
        : DEFAULT_PACKAGE_WEIGHT;

    const payload = {
      order_id: orderNumber,
      order_date: new Date().toISOString(),
      pickup_location: pickupLocation,
      channel_id: channelId,
      comment: "Manual order via Owner Panel",
      billing_customer_name: sanitize(shippingAddress?.firstName, "Customer"),
      billing_last_name: sanitize(shippingAddress?.lastName, ""),
      billing_address: sanitize(shippingAddress?.address, "Default Address"),
      billing_city: sanitize(shippingAddress?.city, "City"),
      billing_pincode: sanitize(
        shippingAddress?.zipCode || shippingAddress?.pincode,
        "560001",
      ),
      billing_state: sanitize(shippingAddress?.state, "State"),
      billing_country: sanitize(shippingAddress?.country, "India"),
      billing_email: sanitize(userEmail, "support@example.com"),
      billing_phone: normalizePhone(shippingAddress?.phone || "9999999999"),
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: totalAmount,
      length: DEFAULT_PACKAGE_LENGTH,
      breadth: DEFAULT_PACKAGE_BREADTH,
      height: DEFAULT_PACKAGE_HEIGHT,
      weight: finalWeight,
      ...(orderData.courierId ? { courier_id: orderData.courierId } : {}),
    };

    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/create/adhoc`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.data || !response.data.shipment_id) {
      console.error(
        "❌ Shiprocket API Response (Missing shipment_id):",
        JSON.stringify(response.data, null, 2),
      );
      throw new Error(
        "API response missing shipment_id. Check logs for details.",
      );
    }

    return { success: true, data: response.data };
  } catch (error) {
    const msg =
      error.response?.data?.message ||
      error.message ||
      "Manual creation failed";
    console.error(
      "❌ Manual Shiprocket Order Error:",
      error.response?.data || error.message,
    );
    return { success: false, message: msg, data: error.response?.data };
  }
};

/* ==================================================
  TRACK SHIPMENT STATUS
================================================== */
export const trackShipment = async (shipmentId, ownerId = null) => {
  try {
    if (!shipmentId)
      return { success: false, message: "No shipment ID provided" };

    let effectiveOwnerId = ownerId;
    if (!effectiveOwnerId) {
      const order = await Order.findOne({
        shiprocketOrderId: shipmentId,
      }).populate({
        path: "userId",
        select: "ownerId",
      });
      if (order && order.userId && order.userId.ownerId)
        effectiveOwnerId = order.userId.ownerId;
    }

    if (!effectiveOwnerId)
      throw new Error("Owner not found for this shipment tracking request");

    const { token } = await shiprocketLogin(effectiveOwnerId);
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/courier/track/shipment/${shipmentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Error tracking shipment:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to track shipment",
    };
  }
};

export const cancelShiprocketOrder = async (
  shiprocketOrderId,
  ownerId = null,
) => {
  try {
    if (!shiprocketOrderId) throw new Error("Shiprocket Order ID is required");
    let token;
    if (ownerId) {
      const auth = await shiprocketLogin(ownerId);
      token = auth.token;
    } else {
      const order = await Order.findOne({
        shiprocketOrderId: shiprocketOrderId,
      }).populate({ path: "userId", select: "ownerId" });
      if (!order || !order.userId || !order.userId.ownerId)
        throw new Error("Could not resolve owner for cancellation");
      const auth = await shiprocketLogin(order.userId.ownerId);
      token = auth.token;
    }
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/cancel`,
      { ids: [shiprocketOrderId] },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return {
      success: true,
      message: "Order cancelled successfully",
      data: response.data,
    };
  } catch (error) {
    console.error(
      "❌ Cancel Shiprocket Order Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to cancel order",
    };
  }
};

export const generateLabel = async (shipmentId, ownerId) => {
  try {
    if (!shipmentId) throw new Error("Shipment ID is required");
    const { token } = await shiprocketLogin(ownerId);
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/courier/generate/label`,
      { shipment_id: [shipmentId] },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Generate Label Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to generate label",
    };
  }
};

export const generateInvoice = async (orderId, ownerId) => {
  try {
    if (!orderId) throw new Error("Order ID is required");
    const { token } = await shiprocketLogin(ownerId);
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/print/invoice`,
      { ids: [orderId] },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Generate Invoice Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to generate invoice",
    };
  }
};

export const generateManifest = async (shipmentId, ownerId) => {
  try {
    if (!shipmentId) throw new Error("Shipment ID is required");
    const { token } = await shiprocketLogin(ownerId);
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/manifests/generate`,
      { shipment_id: [shipmentId] },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Generate Manifest Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to generate manifest",
    };
  }
};

export const generateAWB = async (shipmentId, courierId, ownerId) => {
  try {
    if (!shipmentId) throw new Error("Shipment ID is required");
    if (!courierId)
      throw new Error("Courier ID is required for AWB generation");
    const { token } = await shiprocketLogin(ownerId);
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/courier/assign/awb`,
      { shipment_id: shipmentId, courier_id: courierId },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Generate AWB Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message: error.response?.data?.message || "Failed to generate AWB",
    };
  }
};

/* ==================================================
  CHECK SERVICEABILITY
================================================== */
const getFirstPickupPincode = async (token) => {
  try {
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/settings/company/pickup`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const locations = response.data?.data?.shipping_address;
    if (Array.isArray(locations) && locations.length > 0) {
      return locations[0].pin_code;
    }
    return null;
  } catch (error) {
    console.warn("⚠️ Failed to fetch pickup pincode:", error.message);
    return null;
  }
};

export const checkCourierServiceability = async (params, ownerId) => {
  try {
    const { token, owner } = await shiprocketLogin(ownerId);

    // Evaluate pickup_postcode if missing (prioritize Owner information from DB)
    if (!params.pickup_postcode) {
      const pin =
        owner?.warehouseAddress?.pincode ||
        (await getFirstPickupPincode(token));
      if (pin) params.pickup_postcode = pin;
    }

    // Params: pickup_postcode, delivery_postcode, weight, cod
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/courier/serviceability`,
      {
        params: params,
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Serviceability Check Error:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      message:
        error.response?.data?.message || "Failed to check serviceability",
      data: error.response?.data,
    };
  }
};

/**
 * Map Shiprocket raw status values to the app enum defined on Order.shiprocketStatus
 * Allowed values in model: ["created","picked","in_transit","delivered","failed","pending"]
 */
export const mapShiprocketStatus = (raw) => {
  if (!raw) return "pending";
  const s = String(raw).toLowerCase();

  if (s === "new" || s === "created" || s === "booked") return "created";
  if (
    s.includes("pick") ||
    s.includes("picked") ||
    s.includes("awaiting_pickup")
  )
    return "picked";
  if (
    s.includes("in_transit") ||
    s.includes("intransit") ||
    s.includes("in transit") ||
    s.includes("in-transit")
  )
    return "in_transit";
  if (s.includes("delivered")) return "delivered";
  if (
    s.includes("rto") ||
    s.includes("returned") ||
    s.includes("failed") ||
    s.includes("undelivered")
  )
    return "failed";

  // fallback
  return "pending";
};
