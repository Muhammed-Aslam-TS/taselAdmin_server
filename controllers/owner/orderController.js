import shiprocketService from "../../services/shiprocketService.js";
import { mapShiprocketStatus } from "../../middlewares/shiprocket.js";
import Order from "../../model/orderModel.js";
import mongoose from "mongoose";
// Get all orders (for admin)
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "userId",
        select: "name email phone"
      })
      .populate({
        path: "items.productId",
        select: "name price images"
      });

    res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving orders",
      error: error.message
    });
  }
};

// Get order statuses
export const getOrderStatuses = async (req, res) => {
  try {
    const statuses = {
      PENDING: await Order.countDocuments({ orderStatus: "PENDING" }),
      CONFIRMED: await Order.countDocuments({ orderStatus: "CONFIRMED" }),
      PROCESSING: await Order.countDocuments({ orderStatus: "PROCESSING" }),
      SHIPPED: await Order.countDocuments({ orderStatus: "SHIPPED" }),
      DELIVERED: await Order.countDocuments({ orderStatus: "DELIVERED" }),
      CANCELLED: await Order.countDocuments({ orderStatus: "CANCELLED" }),
      RETURN: await Order.countDocuments({ orderStatus: "RETURN" })
    };

    res.status(200).json({
      success: true,
      message: "Order statuses retrieved successfully",
      data: statuses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving order statuses",
      error: error.message
    });
  }
};

// Update order status (for admin)
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Validate order status
    const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status"
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Update order status
    order.orderStatus = status;
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message
    });
  }
};

// Get order statistics (for admin)
export const getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: "PENDING" });
    const processingOrders = await Order.countDocuments({ orderStatus: "PROCESSING" });
    const shippedOrders = await Order.countDocuments({ orderStatus: "SHIPPED" });
    const deliveredOrders = await Order.countDocuments({ orderStatus: "DELIVERED" });
    const cancelledOrders = await Order.countDocuments({ orderStatus: "CANCELLED" });

    // Calculate total revenue
    const revenue = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: ["DELIVERED", "SHIPPED", "PROCESSING"] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Order statistics retrieved successfully",
      data: {
        totalOrders,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders,
        totalRevenue: revenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving order statistics",
      error: error.message
    });
  }
};

export const createShiprocketOrderfromOrder = async (req, res) => {
  try {
    const { orderId, courierId } = req.body;
    
    // Process order update
    // Resolve ownerId from request (prioritizing authenticated context)
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "orderId is required" });
    }
    
    if (!ownerId) {
       // If owner context is missing, check if user is logged in (admin case?)
       // Or handle error
       console.warn("Owner context missing in createShiprocketOrderfromOrder");
       // return res.status(401).json({ success: false, message: "Unauthorized: Owner context missing" });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid orderId format" });
    }

    // Load order and populate user email if available
    const order = await Order.findById(orderId).populate(
      "userId",
      "email name firstName mobile phone"
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    console.log(order,"++++++++++++++++")

    // Prevent creating duplicate Shiprocket orders
    // If Shiprocket order already exists, try to sync status instead of erroring
    if (order.shiprocketOrderId) {
      console.log(`ℹ️ Shiprocket order ${order.shiprocketOrderId} already exists. Syncing status...`);
      try {
        const tracking = await shiprocketService.trackShipment(order.shiprocketOrderId, ownerId);
        if (tracking && tracking.success && tracking.data) {
           const t = tracking.data;
           const trackData = t.tracking_data || t; 
           
           if (trackData.awb_code) {
             order.shiprocketAWB = trackData.awb_code;
           }
           if (trackData.current_status) {
             order.shiprocketStatus = mapShiprocketStatus(trackData.current_status);
           }
           order.shiprocketLastUpdate = new Date();
           await order.save();
           
           return res.status(200).json({
             success: true,
             message: "Shiprocket order already exists. Status synced successfully.",
             shiprocketOrderId: order.shiprocketOrderId,
             awbCode: order.shiprocketAWB,
             status: order.shiprocketStatus,
             orderData: t
           });
        }
      } catch (syncErr) {
         console.warn("⚠️ Failed to sync existing order:", syncErr.message);
      }
      
      return res
        .status(200) // Return success to avoid UI errors, but indicate existence
        .json({
          success: true,
          message: "Shiprocket order already exists.",
          shiprocketOrderId: order.shiprocketOrderId, 
          awbCode: order.shiprocketAWB
        });
    }

    const shiprocketData = {
      orderNumber: order.orderNumber,
      userEmail: order.userId?.email || order.userEmail || null,
      shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      items: order.items,
      courierId: courierId || null,
    };

    // Use the explicit Owner ID version of the function
    const shiprocketOrder = await shiprocketService.createOrder(shiprocketData, ownerId);
    
    console.log("🚢 shiprocketOrder internal result:", JSON.stringify(shiprocketOrder, null, 2));

    if (!shiprocketOrder || shiprocketOrder.success === false) {
      const message =
        shiprocketOrder?.message || "Failed to create Shiprocket order";
      console.error("⚠️ Shiprocket creation failed:", message);
      return res.status(502).json({ success: false, message });
    }

    const resp = shiprocketOrder.data || shiprocketOrder.orderData || {};
    
    // Map common response fields from Shiprocket into order model
    // Priority: 1. Service's flattened fields, 2. Raw API response (resp)
    const shipmentId =
      shiprocketOrder.shiprocketOrderId ||
      resp.shipment_id || 
      resp.shipmentId || 
      resp.order_id || 
      resp.id || 
      null;

    const innerOrderId = resp.order_id || resp.orderId || null;
    const awb = shiprocketOrder.awbCode || resp.awb_code || resp.awb || null;
    const courier = shiprocketOrder.courierName || resp.courier_name || resp.courier || null;
    const tracking_url =
      shiprocketOrder.trackingUrl || resp.tracking_url || resp.trackingUrl || resp.tracking || null;

    if (shipmentId) order.shiprocketOrderId = shipmentId;
    if (innerOrderId) order.shiprocketInnerOrderId = innerOrderId;
    if (awb) order.shiprocketAWB = awb;
    if (courier) order.shiprocketCourier = courier;

    // Persist raw/audit data
    order.shiprocketRawStatus = resp.status || null;
    order.shiprocketStatusCode = resp.status_code || null;
    order.shiprocketRawResponse = resp || null;

    // Set status and update timestamps
    order.shiprocketStatus = awb ? 'AWB Assigned' : (shipmentId ? 'created' : mapShiprocketStatus(resp.status));
    if (resp.expected_delivery_date)
      order.shiprocketExpectedDelivery = new Date(resp.expected_delivery_date);
    order.shiprocketLastUpdate = new Date();

    await order.save();

    // Build the response in the exact shape you requested
    // Additionally detect empty fields in the shiprocket response (empty string, null, undefined, empty array/object)
    const emptyFields = [];
    const emptyFieldData = {};

    Object.keys(resp).forEach((key) => {
      const val = resp[key];
      const isEmpty =
        val === "" ||
        val === null ||
        typeof val === "undefined" ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === "object" && val && Object.keys(val).length === 0);

      if (isEmpty) {
        emptyFields.push(key);
        emptyFieldData[key] = val;
      }
    });

    const responsePayload = {
      success: true,
      message: shiprocketOrder.isWalletError 
        ? "Order created, but AWB failed: Insufficient Shiprocket Wallet Balance. Please recharge (min ₹100) to assign a rider."
        : shiprocketOrder.availableCouriers?.length > 0 
          ? "Shiprocket order created successfully" 
          : "Order created, but no couriers available. Ensure you use a dedicated 'API User' and check wallet balance.",
      shiprocketOrderId: shipmentId || order.shiprocketOrderId,
      awbCode: awb || order.shiprocketAWB,
      courierName: courier || order.shiprocketCourier,
      trackingUrl: tracking_url || null,
      availableCouriers: shiprocketOrder.availableCouriers || [], // Include available delivery partners
      orderData: Object.keys(resp).length > 0 ? resp : shiprocketOrder,
      emptyFields,
      emptyFieldData,
    };

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("❌ Error creating Shiprocket order from order:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};

// Track shipment by shipmentId or orderId (owner/admin)
export const trackShipmentFromOrder = async (req, res) => {
  try {
    const shipmentId = req.params.shipmentId || req.query.shipmentId || null;
    const orderId = req.params.orderId || req.query.orderId || req.body.orderId || null;

    let idToTrack = shipmentId;

    if (!idToTrack && orderId) {
      // Find order and read its Shiprocket shipment id
      const order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ success: false, message: "Order not found" });
      idToTrack = order.shiprocketOrderId || null;
      if (!idToTrack) return res.status(400).json({ success: false, message: "No Shiprocket shipment id found for this order" });
    }

    if (!idToTrack) {
      return res.status(400).json({ success: false, message: "shipmentId or orderId is required" });
    }

    const tracking = await shiprocketService.trackShipment(idToTrack, req.owner?._id || req.ownerId || req.user?.id);
    if (!tracking || tracking.success === false) {
      return res.status(502).json({ success: false, message: tracking?.message || "Failed to fetch tracking from Shiprocket" });
    }

    const data = tracking.data || {};

    const formatted = {
      shipmentId: idToTrack,
      status: data.status || "Pending",
      courier: data.courier_name || data.courier || null,
      expectedDelivery: data.expected_delivery_date || null,
      awbCode: data.awb_code || null,
      trackingUrl: data.tracking_url || data.trackingUrl || null,
      latestUpdate: data?.tracking_data?.shipment_track?.[0] || null,
      trackingHistory: data?.tracking_data?.shipment_track || [],
      raw: data,
    };

    return res.status(200).json({ success: true, message: "Tracking fetched successfully", data: formatted });
  } catch (error) {
    console.error("❌ Error fetching tracking:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

// Bulk book Shiprocket for multiple orders
export const bulkBookShiprocketOrders = async (req, res) => {
  try {
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    const { orderIds = [], filter = null, concurrency = 5 } = req.body;

    let orders = [];
    if (Array.isArray(orderIds) && orderIds.length > 0) {
      orders = await Order.find({ _id: { $in: orderIds } }).populate('userId', 'email name phone mobile');
    } else if (filter && typeof filter === "object") {
      // Basic filter support (e.g., { orderStatus: 'CONFIRMED' })
      orders = await Order.find(filter).limit(200).populate('userId', 'email name phone mobile');
    } else {
      return res.status(400).json({ success: false, message: "Provide orderIds array or a filter object" });
    }

    if (!orders || orders.length === 0) {
      return res.status(404).json({ success: false, message: "No orders found to process" });
    }

    // helper to process one order
    const processOrder = async (order) => {
      if (order.shiprocketOrderId) {
        return { orderId: order._id, skipped: true, reason: "Already has shiprocketOrderId" };
      }

      // Basic local sanitizers
      const sanitizeLocal = (v, fallback = '') => {
        if (v === null || typeof v === 'undefined') return fallback;
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v.trim();
        return fallback;
      };

      const normalizePhoneLocal = (raw, country = 'IN') => {
        if (!raw) return null;
        let s = String(raw).replace(/\D+/g, '');
        if (s.length === 10 && country === 'IN') return '91' + s;
        if (s.length === 11 && s.startsWith('0') && country === 'IN') return '91' + s.slice(1);
        if (s.length >= 11 && s.length <= 15) return s;
        return null;
      };

      // Ensure shipping address exists and has phone — try fallback to user contact
      const shipping = order.shippingAddress || {};
      if (!shipping || Object.keys(shipping).length === 0) {
        // try fallback to user profile
        const u = order.userId || {};
        if (u && (u.phone || u.mobile || u.email)) {
          shipping.firstName = shipping.firstName || u.name || '';
          shipping.phone = shipping.phone || u.mobile || u.phone || '';
        }
      }

      // Normalize phone
      const rawPhone = sanitizeLocal(shipping.phone || shipping.mobile || shipping.phoneNumber || '');
      const normalizedPhone = normalizePhoneLocal(rawPhone);
      if (!normalizedPhone) {
        return { orderId: order._id, success: false, message: 'Invalid or missing phone for shippingAddress', phone: rawPhone };
      }

      const payload = {
        orderNumber: order.orderNumber,
        userEmail: order.userId?.email || order.userEmail || null,
        shippingAddress: {
          firstName: sanitizeLocal(shipping.firstName || shipping.first_name || ''),
          lastName: sanitizeLocal(shipping.lastName || shipping.last_name || ''),
          address: sanitizeLocal(shipping.address || shipping.address1 || shipping.street || ''),
          city: sanitizeLocal(shipping.city || ''),
          state: sanitizeLocal(shipping.state || ''),
          zipCode: sanitizeLocal(shipping.zipCode || shipping.pincode || shipping.postal || ''),
          phone: normalizedPhone,
        },
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        items: order.items,
      };

      try {
        const sr = await shiprocketService.createOrder(payload, order.userId?.ownerId || ownerId);
        if (!sr || sr.success === false) {
          return { orderId: order._id, success: false, message: sr?.message || 'Shiprocket create failed', data: sr?.data || null };
        }

        const resp = sr.data || {};
        order.shiprocketOrderId = resp.shipment_id || resp.order_id || resp.id || null;
        order.shiprocketInnerOrderId = resp.order_id || null; // Save inner ID
        order.shiprocketAWB = resp.awb_code || resp.awb || null;
        order.shiprocketCourier = resp.courier_name || null;
  order.shiprocketStatus = resp.shipment_id ? 'created' : mapShiprocketStatus(resp.status);
        if (resp.expected_delivery_date) order.shiprocketExpectedDelivery = new Date(resp.expected_delivery_date);
        order.shiprocketLastUpdate = new Date();
        await order.save();

        return { orderId: order._id, success: true, data: resp };
      } catch (err) {
        return { orderId: order._id, success: false, message: err.message || 'Error' };
      }
    };

    // run with concurrency control
    const results = [];
    for (let i = 0; i < orders.length; i += concurrency) {
      const chunk = orders.slice(i, i + concurrency);
      // map to promises and wait
      const settled = await Promise.allSettled(chunk.map((o) => processOrder(o)));
      settled.forEach((s) => {
        if (s.status === 'fulfilled') results.push(s.value);
        else results.push({ success: false, message: s.reason?.message || String(s.reason) });
      });
    }

    return res.status(200).json({ success: true, message: 'Bulk Shiprocket booking finished', count: orders.length, results });
  } catch (error) {
    console.error('❌ Bulk booking error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Check Serviceability
// Check Serviceability
export const checkServiceability = async (req, res) => {
  try {
     const ownerId = req.ownerId || req.user?.id || req.owner?._id;
     // Expect orderId (to auto-fill) OR explicit params
     const { orderId, pickup_postcode, delivery_postcode, weight, cod } = req.query;

     let params = {};

     if (orderId) {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        params = {
           pickup_postcode: pickup_postcode, // If null, middleware will auto-fetch
           delivery_postcode: order.shippingAddress?.zipCode || order.shippingAddress?.pincode,
           cod: (order.paymentMethod === 'COD') ? 1 : 0,
           weight: weight || 0.5 // Default or calculated
        }

     } else {
        params = { pickup_postcode, delivery_postcode, weight, cod };
     }
     
     // Import dynamically to avoid circular dependency issues if any, or just standard import
     const { checkCourierServiceability } = await import("../../middlewares/shiprocket.js");
     const result = await checkCourierServiceability(params, ownerId);
     
     return res.status(result.success ? 200 : 400).json(result);

  } catch (error) {
     return res.status(500).json({ success: false, message: error.message });
  }
};

// Cancel Shiprocket Order
export const cancelOrderShiprocket = async (req, res) => {
  try {
    const { shiprocketOrderId } = req.body;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;

    if (!shiprocketOrderId) {
      return res.status(400).json({ success: false, message: "shiprocketOrderId is required" });
    }

    // Attempt to lookup correct internal ID
    let finalCancelId = shiprocketOrderId;
    const order = await Order.findOne({ 
      $or: [{ shiprocketOrderId: shiprocketOrderId }, { shiprocketInnerOrderId: shiprocketOrderId }]
    });

    if (order) {
       // Prefer inner order ID if available (because cancel API needs order_id)
       if (order.shiprocketInnerOrderId) {
          finalCancelId = order.shiprocketInnerOrderId;
       } else if (order.shiprocketRawResponse && order.shiprocketRawResponse.order_id) {
          // Fallback to raw response if new field not populated yet
          finalCancelId = order.shiprocketRawResponse.order_id;
       }
    }

    console.log(`ℹ️ Cancelling Shiprocket Order. Input: ${shiprocketOrderId}, Resolved: ${finalCancelId}`);

    // Call Service
    const result = await shiprocketService.cancelOrder(finalCancelId, 'Cancelled', ownerId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Update local order status if needed
    if (order) {
       order.shiprocketStatus = 'canceled';
       order.shiprocketLastUpdate = new Date();
       await order.save();
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("❌ Cancel Shiprocket Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

// Get Shiprocket Label
export const getShiprocketLabel = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!shipmentId) return res.status(400).json({ success: false, message: "Shipment ID required" });

    // Label uses shipment_id, which is usually stored as shiprocketOrderId. No lookup needed.
    const result = await shiprocketService.generateLabel(shipmentId, ownerId);

    if (!result.success) return res.status(400).json(result);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Shiprocket Invoice
export const getShiprocketInvoice = async (req, res) => {
  try {
    const { orderId } = req.params; // Expects Shiprocket Order ID
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!orderId) return res.status(400).json({ success: false, message: "Order ID (Shiprocket) required" });

    // Lookup correct inner ID for invoice (needs order_id)
    let finalInvoiceId = orderId;
    const order = await Order.findOne({ 
      $or: [{ shiprocketOrderId: orderId }, { shiprocketInnerOrderId: orderId }]
    });

    if (order) {
      if (order.shiprocketInnerOrderId) {
        finalInvoiceId = order.shiprocketInnerOrderId;
      } else if (order.shiprocketRawResponse && order.shiprocketRawResponse.order_id) {
        finalInvoiceId = order.shiprocketRawResponse.order_id;
      }
    }

    console.log(`ℹ️ Generating Invoice. Input: ${orderId}, Resolved: ${finalInvoiceId}`);

    const result = await shiprocketService.generateInvoice(finalInvoiceId, ownerId);

    if (!result.success) return res.status(400).json(result);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Shiprocket Manifest
export const getShiprocketManifest = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!shipmentId) return res.status(400).json({ success: false, message: "Shipment ID required" });

    // Manifest uses shipment_id
    const result = await shiprocketService.generateManifest(shipmentId, ownerId);

    if (!result.success) return res.status(400).json(result);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Generate AWB / Assign Courier
export const generateShiprocketAWB = async (req, res) => {
  try {
    const { shipmentId, courierId } = req.body;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!shipmentId) return res.status(400).json({ success: false, message: "Shipment ID required" });
    if (!courierId) return res.status(400).json({ success: false, message: "Courier ID required" });

    const result = await shiprocketService.generateAWB(shipmentId, courierId, ownerId);

    if (!result.success) return res.status(400).json(result);

    // Update AWB in local DB if successful
    // We try to find order by shipmentId (shiprocketOrderId)
    const order = await Order.findOne({ shiprocketOrderId: shipmentId });
    if (order && result.data && result.data.awb_assign_status === 1) {
       // AWB assigned successfully
       if (result.data.response && result.data.response.data && result.data.response.data.awb_code) {
          order.shiprocketAWB = result.data.response.data.awb_code;
          order.shiprocketCourier = result.data.response.data.courier_name || order.shiprocketCourier;
          order.shiprocketStatus = 'picked'; // Or based on status
          await order.save();
       } else {
         // Sometimes response structure differs, or just triggering track will fix it
         // Let's trigger a track to be safe
         const trackRes = await shiprocketService.trackShipment(shipmentId, ownerId);
         if (trackRes.success && trackRes.data.awb_code) {
             order.shiprocketAWB = trackRes.data.awb_code;
             await order.save();
         }
       }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Request Shiprocket Pickup
export const requestShiprocketPickup = async (req, res) => {
  try {
    const { shipmentId } = req.body;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!shipmentId) return res.status(400).json({ success: false, message: "Shipment ID required" });

    const result = await shiprocketService.generatePickup(shipmentId, ownerId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Print Shiprocket Manifest
export const printShiprocketManifest = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!shipmentId) return res.status(400).json({ success: false, message: "Shipment ID required" });

    const result = await shiprocketService.printManifest(shipmentId, ownerId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Track Shipment by AWB
export const trackShipmentByAWB = async (req, res) => {
  try {
    const { awbCode } = req.params;
    const ownerId = req.ownerId || req.user?.id || req.owner?._id;
    
    if (!awbCode) return res.status(400).json({ success: false, message: "AWB Code required" });

    const result = await shiprocketService.trackByAWB(awbCode, ownerId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


