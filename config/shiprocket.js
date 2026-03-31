import dotenv from 'dotenv';

dotenv.config();

const shiprocketConfig = {
  // API Configuration
  baseURL: process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1',
  email: process.env.SHIPROCKET_EMAIL,
  password: process.env.SHIPROCKET_PASSWORD,
  
  // Default settings
  defaultWeight: 0.5,
  defaultPickupLocation: 'Primary',
  defaultCountry: 'India',
  
  // API Endpoints
  endpoints: {
    auth: '/external/auth/login',
    serviceability: '/external/courier/serviceability/',
    shipmentServiceability: '/external/courier/serviceability/shipment/',
    createOrder: '/external/orders/create/adhoc',
    trackShipment: '/external/courier/track/shipment',
    courierList: '/external/courier/courierList',
    cancelOrder: '/external/orders/cancel',
    orderDetails: '/external/orders/show',
    pickupLocations: '/external/settings/company/pickup',
    generateAWB: '/external/courier/assign/awb',
    generateLabel: '/external/courier/generate/label',
    generateInvoice: '/external/orders/print/invoice',
    generateManifest: '/external/manifests/generate',
    printManifest: '/external/manifests/print',
    generatePickup: '/external/courier/generate/pickup',
    trackAWB: '/external/courier/track/awb'
  },
  
  // Error messages
  errors: {
    AUTH_FAILED: 'Shiprocket authentication failed',
    INVALID_CREDENTIALS: 'Invalid Shiprocket credentials',
    ORDER_CREATION_FAILED: 'Failed to create Shiprocket order',
    TRACKING_FAILED: 'Failed to track shipment',
    SERVICEABILITY_FAILED: 'Failed to check serviceability',
    NO_COURIER_AVAILABLE: 'No courier service available for this route'
  },
  
  // Status mappings
  statusMapping: {
    'created': 'PENDING',
    'picked': 'PROCESSING',
    'in_transit': 'SHIPPED',
    'delivered': 'DELIVERED',
    'failed': 'CANCELLED',
    'pending': 'PENDING'
  },
  
  // Validation rules
  validation: {
    pincodeLength: 6,
    minWeight: 0.1,
    maxWeight: 50,
    maxOrderValue: 100000
  }
};

export default shiprocketConfig; 