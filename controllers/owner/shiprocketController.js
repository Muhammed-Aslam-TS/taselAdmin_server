import shiprocketService from '../../services/shiprocketService.js';
import Order from '../../model/orderModel.js';
import Owner from '../../model/OwnerModels.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// Helper to resolve Owner ID from request context
const getOwnerId = (req) => {
  if (req.user?.userType === 'owner' && req.user.id) return req.user.id;
  if (req.ownerId) return req.ownerId;
  if (req.user && req.user.ownerId) return req.user.ownerId;
  if (req.owner && req.owner._id) return req.owner._id;
  return req.user?.id; 
};

// Create Shiprocket order
export const createShiprocketOrderController = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const ownerId = getOwnerId(req);
  
  // Get order from database
  const order = await Order.findById(orderId).populate('userId', 'email');
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  // Check if Shiprocket order already exists
  if (order.shiprocketOrderId) {
    throw new ApiError(400, 'Shiprocket order already exists for this order');
  }

  // Prepare order data for Shiprocket
  const orderData = {
    orderId: order.orderNumber,
    userEmail: order.userId.email,
    shippingAddress: order.shippingAddress,
    items: order.items,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    subTotal: order.subtotal,
    discountAmount: 0 
  };

  // Create Shiprocket order with ownerId
  const shiprocketResponse = await shiprocketService.createOrder(orderData, ownerId);
  
  if (!shiprocketResponse.success) {
    throw new ApiError(500, shiprocketResponse.message || 'Failed to create Shiprocket order');
  }

  // Update order with Shiprocket data
  await Order.findByIdAndUpdate(orderId, {
    shiprocketOrderId: shiprocketResponse.shiprocketOrderId,
    shiprocketAWB: shiprocketResponse.awbCode,
    shiprocketStatus: 'created',
    shiprocketCourier: shiprocketResponse.courierName,
    shiprocketLastUpdate: new Date()
  });

  res.status(200).json(new ApiResponse(200, shiprocketResponse, 'Shiprocket order created successfully'));
});

// Check courier serviceability
export const checkServiceability = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pickupPincode = body.pickupPincode || body.pickup_pincode || body.pickup_postcode || req.query.pickupPincode;
  const deliveryPincode = body.deliveryPincode || body.delivery_pincode || body.delivery_postcode || req.query.deliveryPincode;
  const weight = body.weight || req.query.weight || 0.5;
  const cod = body.cod !== undefined ? body.cod : 0;
  const ownerId = getOwnerId(req);

  if (!pickupPincode && !deliveryPincode) {
    throw new ApiError(400, 'Pickup and delivery pincodes are required');
  }

  const serviceability = await shiprocketService.checkServiceability(pickupPincode, deliveryPincode, weight, ownerId, cod);

  if (!serviceability.success) {
    throw new ApiError(400, serviceability.message);
  }

  res.status(200).json(new ApiResponse(200, serviceability.data, 'Serviceability check completed'));
});

// Check courier serviceability for an existing shipment
export const getShipmentServiceabilityController = asyncHandler(async (req, res) => {
  const { shipmentId } = req.params;
  const ownerId = getOwnerId(req);

  if (!shipmentId) {
    throw new ApiError(400, 'Shipment ID is required');
  }

  const serviceability = await shiprocketService.getShipmentServiceability(shipmentId, ownerId);

  if (!serviceability.success) {
    throw new ApiError(400, serviceability.message);
  }

  res.status(200).json(new ApiResponse(200, serviceability.data, 'Shipment serviceability retrieved successfully'));
});

// Track shipment
export const trackShipmentController = asyncHandler(async (req, res) => {
  const { shipmentId } = req.params;
  const ownerId = getOwnerId(req);

  if (!shipmentId) {
    throw new ApiError(400, 'Shipment ID is required');
  }

  const trackingData = await shiprocketService.trackShipment(shipmentId, ownerId);

  if (!trackingData.success) {
    throw new ApiError(400, trackingData.message);
  }

  const formattedTrackingData = {
    shipmentId: shipmentId,
    status: trackingData.data?.status || 'Pending',
    courier: trackingData.data?.courier_name || 'Not Available',
    expectedDelivery: trackingData.data?.expected_delivery_date || null,
    latestUpdate: trackingData.data?.tracking_data?.shipment_track?.length > 0 
      ? trackingData.data.tracking_data.shipment_track[0] 
      : null,
    trackingHistory: trackingData.data?.tracking_data?.shipment_track || [],
    awbCode: trackingData.data?.awb_code || null
  };

  res.status(200).json(new ApiResponse(200, formattedTrackingData, 'Shipment tracking completed'));
});

// Get courier rates
export const getCourierRatesController = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pickupPincode = body.pickupPincode || body.pickup_pincode;
  const deliveryPincode = body.deliveryPincode || body.delivery_pincode;
  const weight = body.weight || req.query.weight || 0.5;
  const ownerId = getOwnerId(req);

  if (!pickupPincode || !deliveryPincode) {
    throw new ApiError(400, 'Pickup and delivery pincodes are required');
  }

  const rates = await shiprocketService.calculateShippingCost(pickupPincode, deliveryPincode, weight, ownerId);

  if (!rates.success) {
    throw new ApiError(400, rates.message);
  }

  res.status(200).json(new ApiResponse(200, rates, 'Shipping rates calculated successfully'));
});

// Track order by order ID
export const getOrderTracking = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const ownerId = getOwnerId(req); 

  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  if (!order.shiprocketOrderId) {
    throw new ApiError(400, 'No Shiprocket order found for this order');
  }

  const trackingData = await shiprocketService.trackShipment(order.shiprocketOrderId, ownerId);

  if (!trackingData.success) {
    throw new ApiError(400, trackingData.message);
  }

  const formattedTrackingData = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    shipmentId: order.shiprocketOrderId,
    status: trackingData.data?.status || 'Pending',
    courier: trackingData.data?.courier_name || 'Not Available',
    expectedDelivery: trackingData.data?.expected_delivery_date || null,
    latestUpdate: trackingData.data?.tracking_data?.shipment_track?.length > 0 
      ? trackingData.data.tracking_data.shipment_track[0] 
      : null,
    trackingHistory: trackingData.data?.tracking_data?.shipment_track || [],
    awbCode: trackingData.data?.awb_code || order.shiprocketAWB
  };

  res.status(200).json(new ApiResponse(200, formattedTrackingData, 'Order tracking completed'));
});

// Get order details with tracking for order success page
export const getOrderWithTracking = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const ownerId = getOwnerId(req);

  const order = await Order.findById(orderId).populate('userId', 'email');
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  let trackingData = null;
  
  // If order has Shiprocket tracking, fetch tracking information
  if (order.shiprocketOrderId) {
    try {
      const shiprocketTracking = await shiprocketService.trackShipment(order.shiprocketOrderId, ownerId);
      
      if (shiprocketTracking.success) {
        trackingData = {
          shipmentId: order.shiprocketOrderId,
          status: shiprocketTracking.data?.status || 'Pending',
          courier: shiprocketTracking.data?.courier_name || 'Not Available',
          expectedDelivery: shiprocketTracking.data?.expected_delivery_date || null,
          latestUpdate: shiprocketTracking.data?.tracking_data?.shipment_track?.length > 0 
            ? shiprocketTracking.data.tracking_data.shipment_track[0] 
            : null,
          trackingHistory: shiprocketTracking.data?.tracking_data?.shipment_track || [],
          awbCode: shiprocketTracking.data?.awb_code || order.shiprocketAWB
        };
      }
    } catch (trackingError) {
      console.error('Error fetching tracking data:', trackingError);
      // Continue without tracking data if there's an error
    }
  }

  res.status(200).json(new ApiResponse(200, {
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.shippingAddress,
      items: order.items,
      createdAt: order.createdAt,
      estimatedDelivery: order.estimatedDelivery,
      shiprocketOrderId: order.shiprocketOrderId,
      shiprocketAWB: order.shiprocketAWB,
      shiprocketStatus: order.shiprocketStatus,
      shiprocketCourier: order.shiprocketCourier
    },
    tracking: trackingData
  }, 'Order details retrieved successfully'));
});

// Test Shiprocket connection
export const testShiprocketConnection = asyncHandler(async (req, res) => {
  const ownerId = getOwnerId(req);
  const connectionTest = await shiprocketService.testConnection(ownerId);
   
  if (!connectionTest.success) {
    throw new ApiError(500, connectionTest.message);
  }

  res.status(200).json(new ApiResponse(200, connectionTest, 'Shiprocket connection test completed'));
});

// Cancel Shiprocket order
export const cancelShiprocketOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const ownerId = getOwnerId(req);

  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  if (!order.shiprocketOrderId) {
    throw new ApiError(400, 'No Shiprocket order found for this order');
  }

  const cancelResponse = await shiprocketService.cancelOrder(order.shiprocketOrderId, reason, ownerId);

  if (!cancelResponse.success) {
    throw new ApiError(500, cancelResponse.message);
  }

  // Update order status
  await Order.findByIdAndUpdate(orderId, {
    orderStatus: 'CANCELLED',
    shiprocketStatus: 'cancelled',
    cancellationReason: reason
  });

  res.status(200).json(new ApiResponse(200, cancelResponse.data, 'Order cancelled successfully'));
});

// Get courier list
export const getCourierList = asyncHandler(async (req, res) => {
  const ownerId = getOwnerId(req);
  const courierList = await shiprocketService.getCourierList(ownerId);

  if (!courierList.success) {
    throw new ApiError(500, courierList.message);
  }

  res.status(200).json(new ApiResponse(200, courierList.data, 'Courier list retrieved successfully'));
});

// Get Shiprocket order details
export const getShiprocketOrderDetails = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const ownerId = getOwnerId(req);

  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  if (!order.shiprocketOrderId) {
    throw new ApiError(400, 'No Shiprocket order found for this order');
  }

  const orderDetails = await shiprocketService.getOrderDetails(order.shiprocketOrderId, ownerId);

  if (!orderDetails.success) {
    throw new ApiError(500, orderDetails.message);
  }

  res.status(200).json(new ApiResponse(200, orderDetails.data, 'Shiprocket order details retrieved successfully'));
});

// Update order status from Shiprocket webhook
// This is a public URL callback from Shiprocket, so it doesn't have an ownerId from req.user
// But it doesn't need to authenticate with Shiprocket, just update local DB.
export const updateOrderStatusFromWebhook = asyncHandler(async (req, res) => {
  const { shipment_id, status, courier_name, awb_code } = req.body;

  if (!shipment_id) {
    throw new ApiError(400, 'Shipment ID is required');
  }

  // Find order by Shiprocket order ID
  const order = await Order.findOne({ shiprocketOrderId: shipment_id });
  
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  // Update order with new status
  const updateData = {
    shiprocketStatus: status,
    shiprocketLastUpdate: new Date()
  };

  if (courier_name) updateData.shiprocketCourier = courier_name;
  if (awb_code) updateData.shiprocketAWB = awb_code;

  // Map Shiprocket status to order status
  const statusMapping = {
    'created': 'PENDING',
    'picked': 'PROCESSING',
    'in_transit': 'SHIPPED',
    'delivered': 'DELIVERED',
    'failed': 'CANCELLED'
  };

  if (statusMapping[status]) {
    updateData.orderStatus = statusMapping[status];
  }

  await Order.findByIdAndUpdate(order._id, updateData);

  res.status(200).json(new ApiResponse(200, { orderId: order._id, status }, 'Order status updated successfully'));
});

// Get pickup locations
export const getPickupLocationsController = asyncHandler(async (req, res) => {
  const ownerId = getOwnerId(req);
  const locations = await shiprocketService.getPickupLocations(ownerId);
  
  if (!locations.success) {
    // Fallback to DB if API fails
    const owner = await Owner.findById(ownerId);
    if (owner && owner.warehouseAddress && owner.warehouseAddress.pickupLocation) {
        const dbLocation = {
            pickup_location: owner.warehouseAddress.pickupLocation,
            name: owner.warehouseAddress.name,
            email: owner.warehouseAddress.email,
            phone: owner.warehouseAddress.phone,
            address: owner.warehouseAddress.address,
            address_2: owner.warehouseAddress.address2,
            city: owner.warehouseAddress.city,
            state: owner.warehouseAddress.state,
            country: owner.warehouseAddress.country,
            pin_code: owner.warehouseAddress.pincode,
            status: 1 // active
        };
        // Return wrapped in expected structure (mocking Shiprocket response)
        // Shiprocket returns { shipping_address: [...] }
        return res.status(200).json(new ApiResponse(200, { 
            shipping_address: [dbLocation] 
        }, 'Pickup locations retrieved from DB (fallback)'));
    }
    
    throw new ApiError(500, locations.message);
  }
  
  res.status(200).json(new ApiResponse(200, locations.data, 'Pickup locations retrieved successfully'));
});

// Generate AWB
export const generateAWBController = asyncHandler(async (req, res) => {
  const { shipment_id, courier_id } = req.body;
  const ownerId = getOwnerId(req);
  
  if (!shipment_id) {
    throw new ApiError(400, 'Shipment ID is required');
  }
  
  const response = await shiprocketService.generateAWB(shipment_id, courier_id, ownerId);
  
  if (!response.success) {
    const errorMsg = response.isWalletError 
      ? "Insufficient Shiprocket Wallet Balance. Please recharge (min ₹100) to assign this courier." 
      : response.message;
    return res.status(400).json(new ApiResponse(400, response.error, errorMsg));
  }
  
  // Update order with AWB
  const order = await Order.findOne({ shiprocketOrderId: shipment_id });
  if (order && response.data?.awb_code) {
      await Order.findByIdAndUpdate(order._id, {
          shiprocketAWB: response.data.awb_code,
          shiprocketStatus: 'AWB Assigned',
          shiprocketCourier: response.data.courier_name,
          shiprocketLastUpdate: new Date()
      });
  }
  
  res.status(200).json(new ApiResponse(200, response.data, 'AWB generated successfully'));
});

// Generate Label
export const generateLabelController = asyncHandler(async (req, res) => {
  const { shipment_id } = req.body; // Can be array or single ID
  const ownerId = getOwnerId(req);
  
  if (!shipment_id) {
    throw new ApiError(400, 'Shipment ID is required');
  }
  
  const response = await shiprocketService.generateLabel(shipment_id, ownerId);
  
  if (!response.success) {
    throw new ApiError(500, response.message);
  }
  
  res.status(200).json(new ApiResponse(200, response, 'Label generated successfully'));
});