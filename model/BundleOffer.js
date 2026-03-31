import mongoose from "mongoose";

const bundleTierSchema = new mongoose.Schema({
  quantity: { type: Number, required: true },
  discountValue: { type: Number, required: true }, // Fixed Price, Percentage, or Fixed Amount
  title: { type: String, required: true },
  subtitle: { type: String },
  badgeEnabled: { type: Boolean, default: false },
  badgeText: { type: String },
  giftProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  image: { type: String }
});

const bundleOfferSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  offerName: {
    type: String,
    required: true,
    trim: true
  },
  triggerType: {
    type: String,
    enum: ['all_products', 'specific_products', 'all_collections', 'specific_collections'],
    required: true,
    default: 'all_products'
  },
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  applicableCollections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  discountType: {
    type: String,
    enum: ['fixed_price', 'percentage', 'fixed_amount'],
    required: true,
    default: 'percentage'
  },
  tiers: [bundleTierSchema],
  combinations: {
    productDiscounts: { type: Boolean, default: false },
    orderDiscounts: { type: Boolean, default: false },
    shippingDiscounts: { type: Boolean, default: false }
  },
  pricingOptions: {
    showPricePerItem: { type: Boolean, default: true },
    hideComparePrice: { type: Boolean, default: false },
    displaySavings: { type: Boolean, default: true },
    exactQuantityOnly: { type: Boolean, default: false },
    useProductComparePrice: { type: Boolean, default: false }
  },
  usageLimits: {
    totalLimit: { type: Number },
    perCustomerLimit: { type: Number }
  },
  eligibility: {
    type: { type: String, enum: ['all', 'specific', 'exclude'], default: 'all' },
    customerSegments: [String]
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

export const BundleOffer = mongoose.models.BundleOffer || mongoose.model("BundleOffer", bundleOfferSchema);
export default BundleOffer;
