import Subscription from "../model/subscriptionModel.js";
import Owner from "../model/OwnerModels.js";

/**
 * Checks for expired subscriptions and updates their status.
 * Also updates the corresponding owner's subscription status.
 */
const checkSubscriptionExpirations = async () => {
  console.log("Running daily subscription expiration check...");
  try {
    const now = new Date();
    
    // Find all active or trial subscriptions that have passed their end date
    const expiredSubscriptions = await Subscription.find({
      status: { $in: ["ACTIVE", "TRIAL"] },
      endDate: { $lt: now }
    });

    if (expiredSubscriptions.length === 0) {
      console.log("No expired subscriptions found.");
      return;
    }

    console.log(`Found ${expiredSubscriptions.length} expired subscriptions. Processing...`);

    for (const subscription of expiredSubscriptions) {
      try {
        console.log(`Expiring subscription for owner: ${subscription.ownerId}`);
        
        // Use the model method if available, otherwise manual update
        if (typeof subscription.expireSubscription === 'function') {
           await subscription.expireSubscription();
        } else {
           // Fallback manual update
           subscription.status = "EXPIRED";
           subscription.isTrial = false;
           await subscription.save();
           
           await Owner.findByIdAndUpdate(subscription.ownerId, { 
             isSubscription: false,
             isActive: false
           });
        }
        
        console.log(`Successfully expired subscription ${subscription._id}`);
      } catch (err) {
        console.error(`Failed to expire subscription ${subscription._id}:`, err);
      }
    }
    
    console.log("Subscription expiration check completed.");
  } catch (error) {
    console.error("Error in checkSubscriptionExpirations:", error);
  }
};

export default checkSubscriptionExpirations;
