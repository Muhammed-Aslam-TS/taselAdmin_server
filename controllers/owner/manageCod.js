import Owner from "../../model/OwnerModels.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { Product } from "../../model/product.js";

// Get COD status
export const getCodStatus = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const owner = await Owner.findById(ownerId);

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  // initialize default if not present
  const defaultSettings = {
    enabled: true,
    minOrderValue: 0,
    maxOrderValue: 50000,
    extraChargeType: 'flat',
    extraChargeValue: 0,
    extraChargeEnabled: true,
    allowAllPincodes: true,
    allowedPincodes: [],
    blockedPincodes: [],
    message: "Cash on Delivery available",
    // Advance Amount
    advanceAmountEnabled: false,
    advanceAmountType: 'flat',
    advanceAmountValue: 0,
    advanceAmountMessage: 'Pay a small advance to confirm your COD order.'
  };

  const codSettings = owner.settings?.codSettings || defaultSettings;

  return res
    .status(200)
    .json(new ApiResponse(200, { codSettings }, "COD settings fetched successfully"));
});


// Update COD settings
export const toggleCod = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const { ...settings } = req.body; 

  const owner = await Owner.findById(ownerId);
  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  // 1. Get Old Rules for comparison
  const oldRules = owner.settings?.codSettings?.productRules || {};

  // 2. Update Owner Settings
  // We explicitly merge to preserve any other settings not in payload (though payload usually has all)
  // and we use set() or direct assignment ensuring we mark it modified.
  if (!owner.settings) owner.settings = {};
  
  // Merging approach to handle Mongoose subdocument casting correctly
  owner.settings.codSettings = {
    ...owner.settings.codSettings,
    ...settings
  };
  
  // IMPORTANT: Explicitly mark modified for mixed/nested types if Mongoose misses it
  owner.markModified('settings');
  
  await owner.save();

  // 3. Sync Logic: Update Product Collection
  // We need to sync the flags.codBlocked and flags.codShippingCharge
  try {
    const newRules = settings.productRules || {};
    const allProductIds = new Set([
      ...Object.keys(oldRules),
      ...Object.keys(newRules)
    ]);

    const bulkOps = [];

    for (const pid of allProductIds) {
      if (!pid) continue;

      const oldRule = oldRules[pid];
      const newRule = newRules[pid];

      // If rule is removed (was in old, not in new) -> Reset to defaults
      if (!newRule) {
        bulkOps.push({
          updateOne: {
            filter: { _id: pid, ownerId: ownerId },
            update: {
              $set: {
                "flags.codBlocked": false,
                "flags.codShippingChargeEnabled": false,
                "flags.codShippingCharge": 0,
                "flags.codShippingChargeType": 'flat',
                "flags.codAdvanceAmountEnabled": false,
                "flags.codAdvanceAmountValue": 0,
                "flags.codAdvanceAmountType": 'flat'
              }
            }
          }
        });
        continue;
      }

      // If rule is new or changed
      const shouldUpdate = !oldRule || 
                            oldRule.blocked !== newRule.blocked || 
                            oldRule.shippingChargeEnabled !== newRule.shippingChargeEnabled ||
                            oldRule.shippingCharge !== newRule.shippingCharge ||
                            oldRule.shippingChargeType !== newRule.shippingChargeType ||
                            oldRule.advanceAmountEnabled !== newRule.advanceAmountEnabled ||
                            oldRule.advanceAmountValue !== newRule.advanceAmountValue ||
                            oldRule.advanceAmountType !== newRule.advanceAmountType;

      if (shouldUpdate) {
        bulkOps.push({
          updateOne: {
            filter: { _id: pid, ownerId: ownerId },
            update: {
              $set: {
                "flags.codBlocked": newRule.blocked === true,
                "flags.codShippingChargeEnabled": newRule.shippingChargeEnabled === true,
                "flags.codShippingCharge": (newRule.shippingCharge != null && !isNaN(Number(newRule.shippingCharge))) ? Number(newRule.shippingCharge) : 0,
                "flags.codShippingChargeType": newRule.shippingChargeType || 'flat',
                "flags.codAdvanceAmountEnabled": newRule.advanceAmountEnabled === true,
                "flags.codAdvanceAmountValue": (newRule.advanceAmountValue != null && !isNaN(Number(newRule.advanceAmountValue))) ? Number(newRule.advanceAmountValue) : 0,
                "flags.codAdvanceAmountType": newRule.advanceAmountType || 'flat'
              }
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
      console.log(`Synced COD rules for ${bulkOps.length} products`);
    }

  } catch (syncError) {
    console.error("Error syncing COD rules to products:", syncError);
    // Continue execution, don't fail the main request just because sync failed
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { codSettings: owner.settings.codSettings },
        "COD settings updated successfully"
      )
    );
});
