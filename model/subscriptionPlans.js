import mongoose from "mongoose";

const subscriptionPlansSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: [ "BASIC", "PREMIUM", "ENTERPRISE"],
      unique: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      monthly: {
        type: Number,
        required: true,
        default: 0
      },
      quarterly: {
        type: Number,
        required: true,
        default: 0
      },
      yearly: {
        type: Number,
        required: true,
        default: 0
      }
    },
    features: {
      maxUsers: {
        type: Number,
        required: true,
        default: 5
      },
      maxProducts: {
        type: Number,
        required: true,
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
      },
      apiAccess: {
        type: Boolean,
        default: false
      },
      whiteLabel: {
        type: Boolean,
        default: false
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Add indexes
subscriptionPlansSchema.index({ isActive: 1 });

// Method to get discounted price
subscriptionPlansSchema.methods.getDiscountedPrice = function(billingCycle) {
  const basePrice = this.price[billingCycle.toLowerCase()];
  if (!basePrice) return 0;

  switch(billingCycle) {
    case 'QUARTERLY':
      return basePrice * 0.9; // 10% discount
    case 'YEARLY':
      return basePrice * 0.8; // 20% discount
    default:
      return basePrice;
  }
};

// Static method to get all active plans
subscriptionPlansSchema.statics.getActivePlans = function() {
  return this.find({ isActive: true }).sort({ 'price.monthly': 1 });
};

// Static method to get plan by name
subscriptionPlansSchema.statics.getPlanByName = function(name) {
  return this.findOne({ name: name.toUpperCase(), isActive: true });
};

// Pre-save middleware to ensure name is uppercase
subscriptionPlansSchema.pre('save', function(next) {
  this.name = this.name.toUpperCase();
  next();
});

const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model("SubscriptionPlan", subscriptionPlansSchema);

// Create default plans if they don't exist
export const seedSubscriptionPlans = async () => {
  try {
    const plansCount = await SubscriptionPlan.countDocuments();
    // Only seed if no plans exist or we want to ensure defaults
    if (plansCount > 0) {
      console.log("Subscription plans already exist, skipping initial seed.");
      return;
    }

    // Try to find an admin to associate with the plans
    const Admin = mongoose.model('Admin');
    let admin = await Admin.findOne();
    
    // If no admin exists, we'll use a placeholder ID to avoid validation error
    // but ideally an admin should exist
    const systemId = admin?._id || new mongoose.Types.ObjectId("000000000000000000000001");

    const defaultPlans = [
      {
        name: "FREE",
        description: "Basic plan for small businesses",
        price: { monthly: 0, quarterly: 0, yearly: 0 },
        features: {
          maxUsers: 5,
          maxProducts: 50,
          analytics: false,
          customDomain: false,
          prioritySupport: false,
          apiAccess: false,
          whiteLabel: false
        },
        isActive: true,
        createdBy: systemId
      },
      {
        name: "BASIC",
        description: "Essential features for growing businesses",
        price: { monthly: 999, quarterly: 2697, yearly: 9596 },
        features: {
          maxUsers: 20,
          maxProducts: 200,
          analytics: true,
          customDomain: false,
          prioritySupport: false,
          apiAccess: true,
          whiteLabel: false
        },
        isActive: true,
        createdBy: systemId
      },
      {
        name: "PREMIUM",
        description: "Advanced features for established businesses",
        price: { monthly: 1999, quarterly: 5397, yearly: 19196 },
        features: {
          maxUsers: 50,
          maxProducts: 500,
          analytics: true,
          customDomain: true,
          prioritySupport: true,
          apiAccess: true,
          whiteLabel: false
        },
        isActive: true,
        createdBy: systemId
      },
      {
        name: "ENTERPRISE",
        description: "Complete solution for large enterprises",
        price: { monthly: 4999, quarterly: 13497, yearly: 47996 },
        features: {
          maxUsers: 100,
          maxProducts: 1000,
          analytics: true,
          customDomain: true,
          prioritySupport: true,
          apiAccess: true,
          whiteLabel: true
        },
        isActive: true,
        createdBy: systemId
      }
    ];

    for (const plan of defaultPlans) {
      await SubscriptionPlan.findOneAndUpdate(
        { name: plan.name },
        plan,
        { upsert: true, new: true }
      );
    }
    console.log("✅ Default subscription plans synchronized successfully");
  } catch (error) {
    console.error("❌ Error seeding subscription plans:", error);
  }
};

export default SubscriptionPlan;
