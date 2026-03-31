import axios from 'axios';
import shiprocketConfig from '../config/shiprocket.js';
import Owner from '../model/OwnerModels.js';

class ShiprocketService {
  constructor() {
    this.baseURL = shiprocketConfig.baseURL;
    // Cache for tokens: { [ownerId]: { token, expiry } }
    // Use 'default' key for env-based credentials if needed
    this.tokenCache = {}; 
    
    // Global dev info (fallback)
    this.globalDevMode = process.env.NODE_ENV === 'development' || 
                         process.env.DEBUG === 'true' ||
                         !process.env.NODE_ENV; // Default to dev mode if not set
  }

  // Get credentials for an owner
  async getCredentials(ownerId) {
    if (!ownerId) {
      // Fallback to env variables if available
      return {
        email: shiprocketConfig.email,
        password: shiprocketConfig.password,
        isEnv: true
      };
    }

    const owner = await Owner.findById(ownerId).select('+shiprocketEmail +shiprocketPassword');
    if (!owner) return null;

    return {
      email: owner.shiprocketEmail || owner.warehouseAddress?.email || owner.email,
      password: owner.shiprocketPassword,
      isEnv: false
    };
  }

  // Get authentication token with caching and retry logic
  async getToken(ownerId = 'default') {
    try {
      // Check cache
      const cached = this.tokenCache[ownerId];
      if (cached && cached.token && cached.expiry && new Date() < cached.expiry) {
        return cached.token;
      }

      // Authenticate
      const credentials = await this.getCredentials(ownerId !== 'default' ? ownerId : null);
      
      if (!credentials || !credentials.email || !credentials.password) {
        throw new Error('Shiprocket credentials not found for this owner. Please configure them in settings.');
      }

      const token = await this.authenticate(credentials);
      
      // Cache token (23 hours)
      this.tokenCache[ownerId] = {
        token,
        expiry: new Date(Date.now() + 23 * 60 * 60 * 1000)
      };

      return token;
    } catch (error) {
      // Re-throw the error so the user knows authentication failed
      throw error;
    }
  }

  // Authenticate with Shiprocket
  async authenticate(credentials) {
    try {
      // console.log(`🔐 Authenticating Shiprocket for ${credentials.email}...`);
      
      const response = await axios.post(`${this.baseURL}${shiprocketConfig.endpoints.auth}`, {
        email: credentials.email,
        password: credentials.password
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.data && response.data.token) {
        return response.data.token;
      } else {
        throw new Error('No token received from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Shiprocket authentication failed:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Shiprocket credentials.');
      } else if (error.response?.status === 403) {
        throw new Error('Access denied to Shiprocket account.');
      } else {
        throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
      }
    }
  }

  // Make authenticated API request
  async makeRequest(method, endpoint, data = null, params = null, ownerId = 'default') {
    console.log(`🚀 Shiprocket Request: ${method} ${endpoint} (Owner: ${ownerId})`);
    try {
      const token = await this.getToken(ownerId);
      console.log(`🔑 Token resolved: REAL`);
      
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      };

      if (data) config.data = data;
      if (params) config.params = params;

      const response = await axios(config);
      console.log(`✅ Real Shiprocket Response Success: ${endpoint}`);
      return response.data;
    } catch (error) {
       console.error(`❌ Shiprocket Request Failed: ${endpoint}`, error.response?.data || error.message);
       
       if (error.response?.status === 401) {
         delete this.tokenCache[ownerId];
       }
       
       // Throw the real error if we were trying a real request
       // Only fallback to mock if we are in dev mode AND the error isn't critical (like 401)
       // OR if the user specifically wants to see why it failed.
       throw error;
    }
  }

  // Mock responses (kept from original)
  getMockResponse(method, endpoint, data, params) {
    console.log(`🔧 Mocking response for: ${endpoint}`);
    
    // Serviceability / Rates
    if (endpoint.includes('serviceability') || endpoint.includes('rates') || endpoint.includes('courier')) {
      return {
        status: 200,
        data: {
          available_courier_companies: [
            { courier_name: 'DTDC', rate: 150, estimated_delivery_days: 3, courier_company_id: 10 },
            { courier_name: 'Blue Dart', rate: 200, estimated_delivery_days: 2, courier_company_id: 20 }
          ]
        }
      };
    }
    
    // Order Creation
    if (endpoint.includes('orders/create') || endpoint.includes('adhoc')) {
      return {
        shipment_id: `MOCK_SHIP_${Date.now()}`,
        order_id: `MOCK_ORD_${Date.now()}`,
        status: "NEW",
        status_code: 1,
        awb_code: `MOCK_AWB_${Math.floor(Math.random() * 1000000)}`,
        courier_name: "Mock Courier",
        tracking_url: "https://example.com/track"
      };
    }

    // Generic fallback for other endpoints (tracking, label, etc.)
    return {
      success: true,
      status: 200,
      data: data || {},
      shipment_id: data?.shipment_id || `MOCK_ID_${Date.now()}`,
      order_id: data?.order_id || `MOCK_ORD_${Date.now()}`,
      label_url: "https://example.com/label.pdf",
      invoice_url: "https://example.com/invoice.pdf",
      awb_code: `MOCK_AWB_${Math.floor(Math.random() * 1000000)}`,
      tracking_data: { shipment_track: [] }
    };
  }

  // Check courier serviceability
  async checkServiceability(pickupPincode, deliveryPincode, weight = 0.5, ownerId = 'default', cod = 0) {
    try {
      let finalPickupPincode = pickupPincode;
      
      // Auto-resolve pickup pincode from owner if missing
      if (!finalPickupPincode && ownerId && ownerId !== 'default') {
        try {
          const owner = await Owner.findById(ownerId).select('warehouseAddress');
          if (owner?.warehouseAddress?.pincode) {
            finalPickupPincode = owner.warehouseAddress.pincode;
            console.log(`📍 Using owner's pickup pincode from DB: ${finalPickupPincode}`);
          }

          // If still missing, try to fetch from Shiprocket API
          if (!finalPickupPincode) {
            console.log(`🔍 No pickup pincode in DB for owner ${ownerId}. Attempting auto-resolution...`);
            const locationsResult = await this.getPickupLocations(ownerId);
            if (locationsResult.success && locationsResult.data?.shipping_address?.length > 0) {
              finalPickupPincode = locationsResult.data.shipping_address[0].pin_code;
              console.log(`📍 Auto-resolved pickup pincode from Shiprocket: ${finalPickupPincode}`);
            }
          }
        } catch (dbError) {
          console.error('⚠️ Failed to resolve owner pickup pincode:', dbError.message);
        }
      }

      if (!finalPickupPincode) {
         finalPickupPincode = shiprocketConfig.defaultPickupPincode || ""; // Fallback if still missing
      }

      const params = {
        pickup_postcode: finalPickupPincode,
        delivery_postcode: deliveryPincode,
        weight: weight,
        cod: cod
      };

      const response = await this.makeRequest('GET', shiprocketConfig.endpoints.serviceability, null, params, ownerId);
      
      return {
        success: true,
        data: response.data,
        availableCouriers: response.data?.available_courier_companies || [],
        message: 'Serviceability check completed'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data || error
      };
    }
  }

  // Check serviceability for a specific shipment
  async getShipmentServiceability(shipmentId, ownerId = 'default', orderId = null) {
    try {
      if (!shipmentId && !orderId) throw new Error('Shipment ID or Order ID is required');
      
      let response;
      let availableCouriers = [];

      // Method 1: Path-based Shipment Serviceability (Suggested for existing shipments)
      // GET /external/courier/serviceability/shipment/{shipment_id}
      if (shipmentId) {
        console.log(`📡 Method 1: Requesting serviceability via shipment path: ${shipmentId}`);
        try {
          response = await this.makeRequest('GET', `${shiprocketConfig.endpoints.shipmentServiceability}${shipmentId}`, null, null, ownerId);
          availableCouriers = response.data?.available_courier_companies || response.available_courier_companies || [];
        } catch (pathError) {
          console.warn(`⚠️ Path-based serviceability failed for ${shipmentId}:`, pathError.message);
        }
      }

      // Method 2: Fallback to Order ID or Query-based check if Method 1 failed or returned empty
      if (availableCouriers.length === 0 && (orderId || shipmentId)) {
        const fallbackParams = orderId ? { order_id: orderId } : { shipment_id: shipmentId };
        console.log(`📡 Method 2: Falling back to query-based check with:`, fallbackParams);
        
        try {
          const fallbackResponse = await this.makeRequest('GET', shiprocketConfig.endpoints.serviceability, null, fallbackParams, ownerId);
          availableCouriers = fallbackResponse.data?.available_courier_companies || fallbackResponse.available_courier_companies || [];
          if (availableCouriers.length > 0) response = fallbackResponse;
        } catch (fallbackError) {
          console.warn(`⚠️ Fallback serviceability check failed:`, fallbackError.message);
        }
      }
      
      if (availableCouriers.length === 0) {
        console.warn(`⚠️ Shiprocket returned zero courier partners for ${orderId ? 'Order' : 'Shipment'} ${orderId || shipmentId}.`);
        console.warn(`💡 Troubleshooting: 1. Check Wallet Balance (>0). 2. Verify Pickup Pincode is active. 3. Ensure KYC is approved.`);
      }

      return {
        success: true,
        data: response,
        availableCouriers: availableCouriers,
        message: availableCouriers.length > 0 ? 'Shipment serviceability retrieved successfully' : 'No couriers available. Check wallet balance or KYC status.'
      };
    } catch (error) {
      console.error('❌ Serviceability Check Error:', JSON.stringify(error.response?.data || error.message, null, 2));
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data || error
      };
    }
  }

  // Create Shiprocket order
  async createOrder(orderData, ownerId = 'default') {
    try {
      // Get pickup location from owner settings if available
      let pickupLocation = null;
      
      if (ownerId && ownerId !== 'default') {
        try {
          const owner = await Owner.findById(ownerId).select('warehouseAddress');
          if (owner?.warehouseAddress?.pickupLocation) {
            pickupLocation = owner.warehouseAddress.pickupLocation;
            console.log(`📍 Using owner's pickup location from DB: ${pickupLocation}`);
          }

          // If not in DB, try to fetch from Shiprocket API directly
          if (!pickupLocation) {
            console.log(`🔍 No pickup location in DB for owner ${ownerId}. Attempting auto-resolution...`);
            const locationsResult = await this.getPickupLocations(ownerId);
            console.log(locationsResult,"________locationsResult")
            if (locationsResult.success && locationsResult.data?.shipping_address?.length > 0) {
              pickupLocation = locationsResult.data.shipping_address[0].pickup_location;
              console.log(`📍 Auto-resolved pickup location from Shiprocket: ${pickupLocation}`);
            }
          }
        } catch (dbError) {
          console.error('⚠️ Failed to resolve owner pickup location:', dbError.message);
        }
      }

      // Fallback to config default if still not resolved
      if (!pickupLocation) {
        pickupLocation = shiprocketConfig.defaultPickupLocation || 'Primary';
        console.log(`📍 Using fallback pickup location: ${pickupLocation}`);
      }

      const shiprocketOrderData = this.formatOrderData(orderData, pickupLocation);
      console.log('📦 Sending to Shiprocket:', JSON.stringify(shiprocketOrderData, null, 2));
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.createOrder, shiprocketOrderData, null, ownerId);

      console.log('🧐 Shiprocket Raw Response:', JSON.stringify(response, null, 2));

      // Shiprocket sometimes returns 200 but with an error message (like "Wrong Pickup location")
      if (response && (response.shipment_id || response.order_id)) {
        const shipmentId = response.shipment_id || response.order_id;
        let availableCouriers = [];
        let finalAwbCode = response.awb_code || "";
        let finalCourierName = response.courier_name || "";

        // Step 1: Attempt instant AWB assignment if courierId is provided
        if (!finalAwbCode && orderData.courierId) {
          console.log(`🚚 Attempting instant AWB assignment for shipment: ${shipmentId} with courier: ${orderData.courierId}`);
          try {
            const awbResult = await this.generateAWB(shipmentId, orderData.courierId, ownerId);
            if (awbResult.success) {
              finalAwbCode = awbResult.awbCode || finalAwbCode;
              finalCourierName = awbResult.courierName || finalCourierName;
              console.log(`✅ AWB Assigned Successfully: ${finalAwbCode}`);
            }
          } catch (awbError) {
            console.warn('⚠️ Instant AWB assignment failed:', awbError.message);
          }
        }

        // Step 2: If no courier is assigned yet, fetch the serviceability list automatically
        if (!finalAwbCode || !finalCourierName) {
          const internalOrderId = response.order_id || null;
          console.log(`🔍 Fetching available courier partners for shipment: ${shipmentId} (Order: ${internalOrderId})`);
          try {
             const serviceability = await this.getShipmentServiceability(shipmentId, ownerId, internalOrderId);
             if (serviceability.success) {
               availableCouriers = serviceability.availableCouriers;
             }
          } catch (servError) {
             console.warn('⚠️ Auto-fetch couriers failed:', servError.message);
          }
        }

        return {
          success: true,
          message: 'Shiprocket order processed successfully',
          shiprocketOrderId: shipmentId,
          awbCode: finalAwbCode,
          courierName: finalCourierName,
          trackingUrl: response.tracking_url || "",
          availableCouriers: availableCouriers, // Include available partners
          data: response 
        };
      } else {
        const errorMsg = response?.message || 'Failed to create Shiprocket order';
        throw new Error(errorMsg);
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data || error
      };
    }
  }

  // Format order data for Shiprocket API
  formatOrderData(orderData, pickupLocation = shiprocketConfig.defaultPickupLocation) {
    const shippingAddress = orderData.shippingAddress || orderData.address || {};
    // Use safe defaults
    
    return {
      order_id: orderData.orderNumber || orderData.orderId || orderData._id || `ORDER_${Date.now()}`,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: pickupLocation,
      billing_customer_name: shippingAddress.firstName || "Customer",
      billing_last_name: shippingAddress.lastName || "",
      billing_address: shippingAddress.address || "Address",
      billing_address_2: shippingAddress.address2 || "",
      billing_city: shippingAddress.city || "City",
      billing_pincode: shippingAddress.pincode || shippingAddress.zipCode || "110001",
      billing_state: shippingAddress.state || "State",
      billing_country: shippingAddress.country || "India",
      billing_email: shippingAddress.email || orderData.userEmail || "support@example.com",
      billing_phone: this.normalizePhone(shippingAddress.phone || "9999999999"),
      shipping_is_billing: true,
      order_items: (orderData.items || []).map((item, index) => ({
        name: item.product_name || item.name || `Product ${index + 1}`,
        sku: item.sku || `SKU_${index + 1}`,
        units: parseInt(item.quantity || 1),
        selling_price: parseFloat(item.price || 0),
        discount: parseFloat(item.discount || 0),
        tax: parseFloat(item.tax || 0),
        hsn: item.hsn || 0
      })),
      payment_method: (orderData.paymentMethod === "COD" || orderData.paymentMethod === "CASH") ? "COD" : "Prepaid",
      sub_total: parseFloat(orderData.subTotal || orderData.totalAmount || 0),
      length: Math.max(1, parseFloat(orderData.packageLength || 10)),
      breadth: Math.max(1, parseFloat(orderData.packageBreadth || 10)),
      height: Math.max(1, parseFloat(orderData.packageHeight || 10)),
      weight: Math.max(0.1, parseFloat(orderData.packageWeight || 0.5)),
      ...(orderData.courierId ? { courier_id: orderData.courierId } : {})
    };
  }

  // Helper to normalize phone numbers
  normalizePhone(rawPhone, country = 'IN') {
    if (!rawPhone) return "9999999999";
    let s = String(rawPhone).replace(/\D+/g, '');
    if (s.length === 10 && country === 'IN') return '91' + s;
    if (s.length === 11 && s.startsWith('0') && country === 'IN') return '91' + s.slice(1);
    return s;
  }

  // Track shipment
  async trackShipment(shipmentId, ownerId = 'default') {
    try {
      if (!shipmentId) throw new Error('Shipment ID is required');
      const response = await this.makeRequest('GET', `${shiprocketConfig.endpoints.trackShipment}/${shipmentId}`, null, null, ownerId);
      
      return {
        success: true,
        data: response,
        message: 'Shipment tracking completed'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data || error
      };
    }
  }

  // Get courier list
  async getCourierList(ownerId = 'default') {
    try {
      const response = await this.makeRequest('GET', shiprocketConfig.endpoints.courierList, null, null, ownerId);
      return { success: true, data: response, message: 'Courier list retrieved' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Calculate shipping cost
  async calculateShippingCost(pickupPincode, deliveryPincode, weight, ownerId = 'default') {
     const serviceability = await this.checkServiceability(pickupPincode, deliveryPincode, weight, ownerId);
     if (serviceability.success && serviceability.availableCouriers.length > 0) {
        const cheapest = serviceability.availableCouriers.reduce((p, c) => p.rate < c.rate ? p : c);
        return {
          success: true,
          cost: cheapest.rate,
          courier: cheapest.courier_name,
          estimatedDays: cheapest.estimated_delivery_days,
          availableCouriers: serviceability.availableCouriers
        };
     }
     return { success: false, message: 'No couriers available' };
  }

  // Cancel Shiprocket order
  async cancelOrder(shipmentId, reason = 'Cancelled', ownerId = 'default') {
    try {
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.cancelOrder, {
        shipment_id: shipmentId,
        reason: reason
      }, null, ownerId);
      return { success: true, data: response, message: 'Order cancelled' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Get order details
  async getOrderDetails(shipmentId, ownerId = 'default') {
    try {
      const response = await this.makeRequest('GET', `${shiprocketConfig.endpoints.orderDetails}/${shipmentId}`, null, null, ownerId);
      return { success: true, data: response.data, message: 'Order details retrieved' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Test connection
  async testConnection(ownerId = 'default') {
    try {
      const token = await this.getToken(ownerId);
      return {
        success: true,
        message: 'Shiprocket connection successful',
        token: token ? 'Received' : 'Not received',
        mode: token === 'mock_token_for_development' ? 'development' : 'production'
      };
    } catch (error) {
      return { success: false, message: error.message, error };
    }
  }

  // Get Pickup Locations
  async getPickupLocations(ownerId = 'default') {
    try {
      const response = await this.makeRequest('GET', shiprocketConfig.endpoints.pickupLocations, null, null, ownerId);
      return { success: true, data: response.data, message: 'Pickup locations retrieved' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Add Pickup Location
  async addPickupLocation(data, ownerId = 'default') {
    try {
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.pickupLocations, data, null, ownerId);
      return { success: true, data: response, message: 'Pickup location added successfully' };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || error.message, error: error.response?.data };
    }
  }

  // Generate AWB
  async generateAWB(shipmentId, courierId = null, ownerId = 'default') {
    try {
      if (!shipmentId) throw new Error('Shipment ID is required');
      
      const data = { shipment_id: shipmentId };
      if (courierId) {
        data.courier_id = courierId;
      }
      
      console.log(`🚚 Assigning AWB for shipment: ${shipmentId} ${courierId ? `with courier: ${courierId}` : '(Auto-assign)'}`);
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.generateAWB, data, null, ownerId);
      
      // Shiprocket response structure for AWB generation can vary
      // Usually it has awb_assign_status: 1
      if (response && response.awb_assign_status === 1) {
          const awbData = response.response?.data || response.data || response;
          return { 
            success: true, 
            data: awbData, 
            awbCode: awbData.awb_code,
            courierName: awbData.courier_name,
            message: 'AWB generated successfully' 
          };
      } else {
          const errorMsg = response?.message || response?.response?.data?.message || 'AWB generation failed';
          const isWalletError = errorMsg.toLowerCase().includes('recharge') || errorMsg.toLowerCase().includes('wallet') || errorMsg.toLowerCase().includes('balance');
          
          return {
            success: false,
            message: errorMsg,
            isWalletError: isWalletError,
            error: response
          };
      }
    } catch (error) {
      const errorData = error.response?.data || {};
      const errorMsg = errorData.message || error.message;
      const isWalletError = errorMsg.toLowerCase().includes('recharge') || errorMsg.toLowerCase().includes('wallet') || errorMsg.toLowerCase().includes('balance');

      console.error('❌ AWB Generation Error:', JSON.stringify(errorData, null, 2));
      
      return { 
        success: false, 
        message: errorMsg, 
        isWalletError: isWalletError,
        error: errorData || error 
      };
    }
  }

  // Generate Label
  async generateLabel(shipmentIds, ownerId = 'default') {
    try {
      const data = {
        shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
      };
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.generateLabel, data, null, ownerId);
      
      if (response.label_created === 1) {
          return { success: true, data: response, label_url: response.label_url, message: 'Label generated' };
      } else {
           throw new Error('Label generation failed');
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Generate Invoice
  async generateInvoice(orderIds, ownerId = 'default') {
    try {
      const data = {
        ids: Array.isArray(orderIds) ? orderIds : [orderIds]
      };
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.generateInvoice, data, null, ownerId);
      return { success: true, data: response, message: 'Invoice generated' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Generate Manifest
  async generateManifest(shipmentIds, ownerId = 'default') {
    try {
      const data = {
        shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
      };
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.generateManifest, data, null, ownerId);
      return { success: true, data: response, message: 'Manifest generated' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Print Manifest
  async printManifest(shipmentIds, ownerId = 'default') {
    try {
      const data = {
        shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
      };
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.printManifest, data, null, ownerId);
      return { success: true, data: response, manifest_url: response.manifest_url, message: 'Manifest print URL generated' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Generate Pickup
  async generatePickup(shipmentIds, ownerId = 'default') {
    try {
      const data = {
        shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
      };
      const response = await this.makeRequest('POST', shiprocketConfig.endpoints.generatePickup, data, null, ownerId);
      return { success: true, data: response, message: 'Pickup generated successfully' };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  // Track by AWB
  async trackByAWB(awbCode, ownerId = 'default') {
    try {
      if (!awbCode) throw new Error('AWB Code is required');
      const response = await this.makeRequest('GET', `${shiprocketConfig.endpoints.trackAWB}/${awbCode}`, null, null, ownerId);
      return { success: true, data: response, message: 'Tracking details retrieved via AWB' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

export default new ShiprocketService();