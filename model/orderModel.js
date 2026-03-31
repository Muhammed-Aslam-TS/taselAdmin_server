import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  product_name: {
    type: String,
    required: true,
  },
  variantId: {
    type: String,
    default: null,
  },
  price: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: {
    type: String,
    required: true,
  },
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: false,
  },
  gstAmount: {
    type: Number,
    required: false,
  },
  shippingAmount: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  shippingAddress: {
    firstName: String,
    lastName: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
  },
  paymentMethod: {
    type: String,
    enum: ["COD", "RAZORPAY", "CASHFREE"], // ✅ Added CASHFREE
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "FAILED"],
    default: "PENDING",
  },
  orderStatus: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN", "RETURN_REQUESTED", "RETURNED"],
    default: "PENDING",
  },
  cancellationReason: {
    type: String,
    required: false,
  },
  razorpayOrderId: {
    type: String,
    required: false,
  },
  cashfreeOrderId: {
    type: String,
    required: false,
  },
  trackingNumber: {
    type: String,
  },
  couponCode: {
    type: String,
    default: null,
  },
  estimatedDelivery: {
    type: Date,
  },
  // Shiprocket fields
  shiprocketOrderId: {
    type: String,
    default: null,
    index: true,
  },
  shiprocketInnerOrderId: {
    type: String, // The internal order_id from Shiprocket (distinct from shipment_id)
    default: null,
  },
  shiprocketAWB: {
    type: String,
    default: null,
    index: true,
  },
  shiprocketStatus: {
    type: String,
    enum: ["created", "picked", "in_transit", "delivered", "failed", "pending"],
    default: null,
  },
  shiprocketTrackId: {
    type: String,
    default: null,
    index: true,
  },
  // raw/audit fields from Shiprocket
  shiprocketRawStatus: {
    type: String,
    default: null,
  },
  shiprocketStatusCode: {
    type: Number,
    default: null,
  },
  shiprocketRawResponse: {
    type: Object,
    default: null,
  },
  shiprocketCancellationReason: {
    type: String,
    default: null,
  },
  shiprocketCourier: {
    type: String,
    default: null,
  },
  shiprocketExpectedDelivery: {
    type: Date,
    default: null,
  },
  shiprocketTrackingHistory: [
    {
      status: String,
      location: String,
      timestamp: Date,
      description: String,
    },
  ],
  shiprocketLastUpdate: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save middleware to generate order number
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    // Get count of orders for today
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const count = await this.constructor.countDocuments({
      createdAt: { $gte: today },
    });

    // Format: ORD-YYMMDD-XXXX (where XXXX is a sequential number)
    this.orderNumber = `ORD-${year}${month}${day}-${(count + 1)
      .toString()
      .padStart(4, "0")}`;
  }
  // Only update shiprocketLastUpdate when shiprocket-related fields changed
  try {
    const shiprocketFields = [
      'shiprocketOrderId',
      'shiprocketAWB',
      'shiprocketStatus',
      'shiprocketTrackId',
      'shiprocketRawResponse',
      'shiprocketStatusCode',
      'shiprocketCourier',
      'shiprocketExpectedDelivery',
      'shiprocketTrackingHistory'
    ];

    const shouldUpdateLast = shiprocketFields.some((f) => this.isModified && typeof this.isModified === 'function' ? this.isModified(f) : false);
    if (shouldUpdateLast) {
      this.shiprocketLastUpdate = new Date();
    }
  } catch (e) {
    // ignore any failure here — don't block save
    // but log to console for visibility during development
    console.error('Error evaluating shiprocketLastUpdate condition', e);
  }

  next();
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;
