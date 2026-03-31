import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    ownerId: {
      index: true,
      ref: "Owner",
      required: true,
      type: mongoose.Schema.Types.ObjectId,
    },
    title: {
      required: true,
      trim: true,
      type: String,
    },
    description: {
      trim: true,
      type: String
    },
    offerCode: {
      required: true,
      trim: true,
      type: String,
      uppercase: true,
    },

    // --- OFFER TYPE & VALUE ---
    discountType: {
      type: String,
      enum: ['percentage', 'fixed', 'bogo'], // BOGO = Buy X Get Y
      required: true,
      default: 'percentage',
    },
    // For 'percentage' or 'fixed' discount types
    discountValue: {
      type: Number,
      min: 0,
      // Conditionally required based on discountType
      required: function() { return this.discountType !== 'bogo'; },
    },
    // For 'bogo' (Buy One, Get One) discount type
    buyQuantity: {
      min: 1,
      required: function() { return this.discountType === 'bogo'; },
      type: Number,
    },
    getQuantity: {
      min: 1,
      required: function() { return this.discountType === 'bogo'; },
      type: Number,
    },

    // --- APPLICABILITY / SCOPE ---
    scope: {
      type: String,
      enum: ['all', 'product', 'category'], // 'all' for site-wide
      required: true,
      default: 'all',
    },
    // Use arrays to allow offers to apply to multiple products or categories
    appliesToProducts: {
      default: [],
      type: [{ ref: 'Product', type: mongoose.Schema.Types.ObjectId }],
      validate: {
        message: 'At least one product must be selected for a product-scoped offer.',
        validator: function(value) {
          // If scope is 'product', this array must not be empty.
          return this.scope !== 'product' || (Array.isArray(value) && value.length > 0);
        }
      }
    },
    appliesToCategories: {
      default: [],
      type: [{ ref: 'Category', type: mongoose.Schema.Types.ObjectId }],
      validate: {
        message: 'At least one category must be selected for a category-scoped offer.',
        validator: function(value) {
          // If scope is 'category', this array must not be empty.
          return this.scope !== 'category' || (Array.isArray(value) && value.length > 0);
        }
      }
    },

    // --- CONDITIONS & CONSTRAINTS ---
    minPurchaseAmount: {
      default: 0,
      type: Number,
    },
    maxDiscountAmount: { // Optional: sets a maximum discount amount for percentage-based offers
      type: Number,
    },
    usageLimitPerUser: { // How many times a single user can use this coupon
      type: Number,
      default: 1,
    },
    totalUsageLimit: { // Total number of times the coupon can be used across all users
      type: Number,
    },
    totalUsageCount: { // New field to track usage
      type: Number,
      default: 0,
    },

    // --- TIMING & STATUS ---
    // `startDate` and `endDate` handle all time-based logic for any offer type
    startDate: {
      default: Date.now,
      required: true,
      type: Date,
    },
    endDate: { 
      type: Date,
      required: true,
      // Setting expires to 0 means the document expires at the time specified in this field
      expires: 0 
    },
    // This field is for UI hints, e.g., to show a special banner for flash sales.
    displayType: {
      default: 'standard',
      enum: ['flash_sale', 'standard', 'event'],
      type: String
    },
    status: {
      default: 'active',
      enum: ['active', 'inactive', 'expired'],
      type: String,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Compound index to ensure offer codes are unique per owner
offerSchema.index({ offerCode: 1, ownerId: 1 }, { unique: true });

// Pre-save middleware to automatically manage status based on dates
offerSchema.pre('save', function(next) {
  // If status is not manually set to inactive, check expiry.
  // This prevents an expired offer from being saved as 'active'.
  if (this.isModified('status') && this.status !== 'active') {
    return next();
  }
  if (this.endDate < new Date()) {
    this.status = 'expired';
  }
  next();
});

// Virtual property to check if the offer is currently valid and usable
offerSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.status === 'active' && this.startDate <= now && this.endDate >= now;
});

export default mongoose.models.Offer || mongoose.model("Offer", offerSchema);
