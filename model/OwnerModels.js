// import mongoose, { Schema, model } from "mongoose";

// const OwnerSchema = new Schema(
//   {
//     username: { type: String, trim: true, required: true, index: true },
//     email: {
//       type: String,
//       trim: true,
//       required: true,
//       lowercase: true,
//       index: true,
//       unique: true,
//     },
//     mobile: { type: String, trim: true },
//     password: {
//       // 👈 Must exist
//       type: String,
//       required: true,
//     },

//     // Company details / addresses (structured)
//     companyName: { type: String, trim: true },
//     companyAddress: { type: String, trim: true }, // combined fallback
//     streetAddress: { type: String, trim: true },
//     city: { type: String, trim: true },
//     state: { type: String, trim: true },
//     country: { type: String, trim: true, default: "India" },
//     pincode: { type: String, trim: true },

//     // Domains / tenancy
//     primaryDomain: { type: String, trim: true, sparse: true, unique: true },
//     storeDomains: [{ type: String, trim: true }],

//     // Files / images
//     logo: { type: String, trim: true },
//     idProof: { type: String, trim: true },
//     referralCode: { type: String, trim: true },

//     // Payment (Razorpay)
//     razorpayKeyId: { type: String, trim: true },
//     razorpayKeySecret: { type: String, trim: true, select: false },

//     // Shiprocket settings
//     shiprocketEmail: { type: String, trim: true, lowercase: true },
//     shiprocketPassword: { type: String, trim: true, select: false },
//     shiprocketAuthToken: { type: String, trim: true, select: false },
//     shiprocketAccountId: { type: String, trim: true },

//     // Operational flags
//     isActive: { type: Boolean, default: true },
//     metadata: { type: Schema.Types.Mixed },

//     settings: {
//       allowGuestCheckout: { type: Boolean, default: true },
//       defaultCurrency: { type: String, default: "INR" },
//     },
//   },
//   {
//     timestamps: true,
//     toJSON: { virtuals: true },
//     toObject: { virtuals: true },
//   }
// );

// // Indexes
// OwnerSchema.index({ storeDomains: 1 });
// OwnerSchema.index({ companyName: "text", username: "text", email: "text" });

// // Virtual: display full address
// OwnerSchema.virtual("fullAddress").get(function () {
//   const parts = [];
//   if (this.streetAddress) parts.push(this.streetAddress);
//   if (this.city) parts.push(this.city);
//   if (this.state) parts.push(this.state);
//   if (this.pincode) parts.push(this.pincode);
//   if (this.country) parts.push(this.country);
//   if (parts.length) return parts.join(", ");
//   return this.companyAddress || "";
// });

// // Static helper: find owner by host
// OwnerSchema.statics.findByHost = function (host) {
//   if (!host) return Promise.resolve(null);
//   return this.findOne({
//     $or: [{ primaryDomain: host }, { storeDomains: host }],
//   }).exec();
// };

// // Normalize domains before save
// OwnerSchema.pre("save", function (next) {
//   if (this.primaryDomain)
//     this.primaryDomain = this.primaryDomain.toLowerCase().trim();
//   if (Array.isArray(this.storeDomains)) {
//     this.storeDomains = this.storeDomains
//       .map((d) => (d ? d.toLowerCase().trim() : d))
//       .filter(Boolean);
//   }
//   next();
// });

// const Owner = mongoose.model("Owner", OwnerSchema);

// export default Owner;



import mongoose, { Schema, model } from "mongoose";

const OwnerSchema = new Schema(
  {
    username: { type: String, trim: true, required: true, index: true },
    email: {
      type: String,
      trim: true,
      required: true,
      lowercase: true,
      index: true,
      unique: true,
    },
    mobile: { type: String, trim: true },
    password: {
      type: String,
      required: true,
    },
    
    // Company details / addresses (structured)
    companyName: { type: String, trim: true },
    companyAddress: { type: String, trim: true }, // combined fallback
    streetAddress: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: "India" },
    pincode: { type: String, trim: true },

    // Warehouse / Pickup Location (Synced with Shiprocket)
    warehouseAddress: {
      pickupLocation: { type: String, trim: true }, // Nickname
      name: { type: String, trim: true }, // Contact person
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      address2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: "India" },
      pincode: { type: String, trim: true },
    },
    
    // Domains / tenancy
    primaryDomain: { type: String, trim: true, sparse: true, unique: true },
    storeDomains: [{ type: String, trim: true }],
    
    // Files / images
    logo: { type: String, trim: true },
    idProof: { type: String, trim: true },
    referralCode: { type: String, trim: true },
    
    // Payment (Razorpay)
    razorpayKeyId: { type: String, trim: true },
    razorpayKeySecret: { type: String, trim: true, select: false },

    // Payment (Cashfree)
    cashfreeAppId: { type: String, trim: true },
    cashfreeSecretKey: { type: String, trim: true, select: false },
    cashfreeMode: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
    
    // Shiprocket settings
    shiprocketEmail: { type: String, trim: true, lowercase: true },
    shiprocketPassword: { type: String, trim: true, select: false },
    shiprocketAuthToken: { type: String, trim: true, select: false },
    shiprocketAccountId: { type: String, trim: true },
    shiprocketLastSyncAt: { type: Date },
    
    // Operational flags
    isActive: { type: Boolean, default: true },
    isSubscription: { type: Boolean, default: false }, // Subscription status for managing products
    planName:{type:String,uppercase:true},
    SubscriptionStartTime:{type:Date},
    SubscriptionEndTime:{type:Date},
    // Metadata / settings object
    metadata: { type: Schema.Types.Mixed },
    settings: {
      allowGuestCheckout: { type: Boolean, default: true },
      guestUserEnabled: { type: Boolean, default: false },
      defaultCurrency: { type: String, default: "INR" },
      cashOnDelivery: { type: Boolean, default: true },
      codSettings: {
        enabled: { type: Boolean, default: true },
        minOrderValue: { type: Number, default: 0 },
        maxOrderValue: { type: Number, default: 50000 },
        extraChargeType: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
        extraChargeValue: { type: Number, default: 0 },
        extraChargeEnabled: { type: Boolean, default: true },
        allowAllPincodes: { type: Boolean, default: true },
        allowedPincodes: [{ type: String }],
        blockedPincodes: [{ type: String }],
        message: { type: String, default: 'Cash on Delivery available' },
        productRules: { type: Schema.Types.Mixed, default: {} },
        // RTO Prevention Settings
        highRiskExtraCharge: { type: Number, default: 0 },
        requireConfirmationForMediumRisk: { type: Boolean, default: false },
        maxRiskAreaOrderValue: { type: Number, default: 5000 },
        highRiskThreshold: { type: Number, default: 20 },
        mediumRiskThreshold: { type: Number, default: 10 },
        // Advance Amount Settings
        advanceAmountEnabled: { type: Boolean, default: false },
        advanceAmountType: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
        advanceAmountValue: { type: Number, default: 0 },
        advanceAmountMessage: { type: String, default: 'Pay a small advance to confirm your COD order.' }
      },
      shippingSettings: {
        type: { type: String, enum: ['flat', 'free', 'price_based', 'weight_based'], default: 'flat' },
        flatRate: { type: Number, default: 0 },
        freeShippingThreshold: { type: Number, default: 0 }, // 0 = disabled
        gstPercentage: { type: Number, default: 0 },
        pickupPincode: { type: String, trim: true },
        // Price based specifics
        priceBasedRules: [{
          minAmount: Number,
          maxAmount: Number,
          shippingCharge: Number
        }]
      },
    },
    
    // Theme customization (for backward compatibility with old UI customization)
    // Note: New theme system uses separate Theme model with ownerId reference
    activeTheme: { type: String, default: 'theme1' }, // theme1, theme2, theme3, theme4, theme5
    uiThemes: { type: Schema.Types.Mixed, default: {} }, // Multiple theme presets (old system)
    uiTheme: { type: Schema.Types.Mixed, default: {} }, // Legacy single theme (old system)
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
OwnerSchema.index({ storeDomains: 1 });
OwnerSchema.index({ companyName: "text", username: "text", email: "text" });

// Virtual: display full address
OwnerSchema.virtual("fullAddress").get(function () {
  const parts = [];
  if (this.streetAddress) parts.push(this.streetAddress);
  if (this.city) parts.push(this.city);
  if (this.state) parts.push(this.state);
  if (this.pincode) parts.push(this.pincode);
  if (this.country) parts.push(this.country);
  if (parts.length) return parts.join(", ");
  return this.companyAddress || "";
});

// Static helper: find owner by host
OwnerSchema.statics.findByHost = function (host) {
  if (!host) return Promise.resolve(null);

  const cleanHost = host.replace(/^www\./, "").toLowerCase();
  const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";
  
  const queries = [{ primaryDomain: cleanHost }, { storeDomains: cleanHost }];

  if (cleanHost.endsWith(`.${BASE_DOMAIN}`)) {
    const username = cleanHost.slice(0, -(`.${BASE_DOMAIN}`.length));
    if (username) queries.push({ username });
  }

  return this.findOne({
    $or: queries,
  }).exec();
};

// Normalize domains before save
OwnerSchema.pre("save", function (next) {
  if (this.primaryDomain)
    this.primaryDomain = this.primaryDomain.toLowerCase().trim();
  if (Array.isArray(this.storeDomains)) {
    this.storeDomains = this.storeDomains
      .map((d) => (d ? d.toLowerCase().trim() : d))
      .filter(Boolean);
  }
  next();
});

const Owner = mongoose.models.Owner || mongoose.model("Owner", OwnerSchema);

export default Owner;
