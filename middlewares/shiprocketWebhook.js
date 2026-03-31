import crypto from 'crypto';
import Order from '../model/orderModel.js';
import shiprocketService from '../services/shiprocketService.js';

// Webhook secret (should be set in environment variables)
const WEBHOOK_SECRET = process.env.SHIPROCKET_WEBHOOK_SECRET || 'your_webhook_secret';

// Validate webhook signature
export const validateWebhookSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-shiprocket-signature'];
    const payload = JSON.stringify(req.body);
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Create expected signature
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  } catch (error) {
    console.error('Webhook signature validation error:', error);
    return res.status(500).json({ error: 'Signature validation failed' });
  }
};

// Process Shiprocket webhook
export const processShiprocketWebhook = async (req, res) => {
  try {
    const { 
      awb_code, 
      courier_name, 
      expected_delivery_date, 
      shipment_id, 
      status,
      tracking_data 
    } = req.body;

    console.log('📦 Processing Shiprocket webhook:', {
      awb_code,
      courier_name,
      shipment_id,
      status
    });

    if (!shipment_id) {
      return res.status(400).json({ error: 'Shipment ID is required' });
    }

    // Find order by Shiprocket order ID
    const order = await Order.findOne({ shiprocketOrderId: shipment_id });
    
    if (!order) {
      console.log('⚠️ Order not found for shipment:', shipment_id);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order with new status
    const updateData = {
      shiprocketLastUpdate: new Date(),
      shiprocketStatus: status
    };

    if (courier_name) updateData.shiprocketCourier = courier_name;
    if (awb_code) updateData.shiprocketAWB = awb_code;
    if (expected_delivery_date) updateData.shiprocketExpectedDelivery = new Date(expected_delivery_date);

    // Map Shiprocket status to order status
    const statusMapping = {
      // 'created' is removed to prevent regressing a 'CONFIRMED' order back to 'PENDING'.
      // The order is already confirmed in our system before a Shiprocket order is created.
      'delivered': 'DELIVERED',
      'failed': 'CANCELLED',
      'in_transit': 'SHIPPED',
      'out_for_delivery': 'SHIPPED',
      'picked': 'PROCESSING',
      'returned': 'RETURNED' // Corrected to match the enum in your orderModel.js
    };

    if (statusMapping[status]) {
      updateData.orderStatus = statusMapping[status];
    }

    // If the order is delivered and it was a COD order, update payment status to PAID
    if (status === 'delivered' && order.paymentMethod === 'COD') {
      updateData.paymentStatus = 'PAID';
    }

    // Update tracking history if available
    if (tracking_data && tracking_data.shipment_track) {
      updateData.shiprocketTrackingHistory = tracking_data.shipment_track.map(track => ({
        description: track.status_description || '',
        location: track.location || '',
        status: track.status,
        timestamp: new Date(track.timestamp || Date.now())
      }));
    }

    await Order.findByIdAndUpdate(order._id, updateData);

    console.log('✅ Order status updated successfully:', {
      courier: courier_name,
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: status
    });

    res.status(200).json({ 
      message: 'Webhook processed successfully', 
      orderId: order._id,
      status: status,
      success: true 
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
};

// Manual status sync (for admin use)
export const syncOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Populate userId to access ownerId, or rely on req.owner if available
    const order = await Order.findById(orderId).populate({
      path: 'userId',
      select: 'ownerId'
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.shiprocketOrderId) {
      return res.status(400).json({ error: 'No Shiprocket order found for this order' });
    }

    // Determine ownerId
    const ownerId = req.ownerId || req.user?.id || order.userId?.ownerId || req.owner?._id;

    // Get latest status from Shiprocket
    const trackingData = await shiprocketService.trackShipment(order.shiprocketOrderId, ownerId);

    if (!trackingData.success) {
      return res.status(500).json({ error: 'Failed to fetch tracking data', message: trackingData.message });
    }

    const trackingInfo = trackingData.data;
    
    // Update order with latest status
    const updateData = {
      shiprocketLastUpdate: new Date(),
      shiprocketStatus: trackingInfo.status
    };

    if (trackingInfo.courier_name) updateData.shiprocketCourier = trackingInfo.courier_name;
    if (trackingInfo.awb_code) updateData.shiprocketAWB = trackingInfo.awb_code;
    if (trackingInfo.expected_delivery_date) {
      updateData.shiprocketExpectedDelivery = new Date(trackingInfo.expected_delivery_date);
    }

    // Map Shiprocket status to order status
    const statusMapping = {
      'created': 'PENDING',
      'delivered': 'DELIVERED',
      'failed': 'CANCELLED',
      'in_transit': 'SHIPPED',
      'out_for_delivery': 'SHIPPED',
      'picked': 'PROCESSING',
      'returned': 'RETURN'
    };

    if (statusMapping[trackingInfo.status]) {
      updateData.orderStatus = statusMapping[trackingInfo.status];
    }

    // Update tracking history
    if (trackingInfo.tracking_data && trackingInfo.tracking_data.shipment_track) {
      updateData.shiprocketTrackingHistory = trackingInfo.tracking_data.shipment_track.map(track => ({
        description: track.status_description || '',
        location: track.location || '',
        status: track.status,
        timestamp: new Date(track.timestamp || Date.now())
      }));
    }

    await Order.findByIdAndUpdate(order._id, updateData);

    res.status(200).json({
      data: {
        awbCode: trackingInfo.awb_code,
        courier: trackingInfo.courier_name,
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: trackingInfo.status
      },
      message: 'Order status synced successfully',
      success: true
    });

  } catch (error) {
    console.error('❌ Status sync error:', error);
    res.status(500).json({ 
      error: 'Status sync failed',
      message: error.message 
    });
  }
};

export default {
  processShiprocketWebhook,
  syncOrderStatus,
  validateWebhookSignature
}; 