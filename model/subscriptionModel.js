import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Owner'
    },
    createdAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Admin'
    },
    plan: {
      type: String,
      enum: ["FREE", "BASIC", "PREMIUM", "ENTERPRISE", "TRIAL"],
      default: "TRIAL"
    },
    price: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "PENDING", "CANCELLED", "TRIAL"],
      default: "ACTIVE"
    },
    features: {
      maxUsers: {
        type: Number,
        default: 5
      },
      maxProducts: {
        type: Number,
        default: 50
      },
      analytics: {
        type: Boolean,
        default: false
      },
      customDomain: {
        type: Boolean,
        default: false
      },
      prioritySupport: {
        type: Boolean,
        default: false
      }
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY", "FREE"],
      default: "FREE"
    },
    isTrial: {
      type: Boolean,
      default: true
    },
    razorpayOrderId: {
      type: String
    },
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed
    },
    paymentMethod: {
      type: String,
      default: "RAZORPAY"
    },
    lastPaymentId: {
      type: String
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    cancellationReason: {
      type: String
    },
    cancelledAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Add indexes for better query performance
subscriptionSchema.index({ ownerId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function () {
  const now = new Date();
  return this.status === "ACTIVE" && now <= this.endDate;
};

// Method to check if subscription is in trial
subscriptionSchema.methods.isInTrial = function () {
  const now = new Date();
  return this.status === "TRIAL" && now <= this.endDate;
};

// Method to get days remaining in trial
subscriptionSchema.methods.getTrialDaysRemaining = function () {
  if (!this.isInTrial()) return 0;
  const now = new Date();
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Method to get days remaining in subscription
subscriptionSchema.methods.getDaysRemaining = function () {
  if (this.status === "EXPIRED") return 0;
  const now = new Date();
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Method to check if subscription needs renewal
subscriptionSchema.methods.needsRenewal = function () {
  const now = new Date();
  const daysRemaining = this.getDaysRemaining();
  return daysRemaining <= 7 && this.status !== "CANCELLED"; // Notify 7 days before expiry
};

// Method to expire subscription
subscriptionSchema.methods.expireSubscription = async function () {
  this.status = "EXPIRED";
  this.isTrial = false;
  await this.save();
  
  // Update owner's subscription status
  const Owner = mongoose.model('Owner');
  await Owner.findByIdAndUpdate(this.ownerId, { 
    isSubscription: false,
    isActive: false 
  });
  
  return this;
};

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
