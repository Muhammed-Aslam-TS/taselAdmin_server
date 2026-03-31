import Owner from "../../model/OwnerModels.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get Public Shipping Settings (No Auth)
export const getPublicShippingConfig = asyncHandler(async (req, res) => {
  // Assuming single owner or derived from host (middleware might attach req.owner)
  // Fallback to finding the first owner if req.owner is not set
  let owner = req.owner;
  
  if (!owner) {
     owner = await Owner.findOne();
  }

  if (!owner) {
    throw new ApiError(404, "Store owner configuration not found");
  }

  // initialize default if not present
  const defaultShippingSettings = {
    type: 'flat',
    flatRate: 0,
    freeShippingThreshold: 0,
    gstPercentage: 0,
    pickupPincode: "",
    priceBasedRules: []
  };

  const defaultCodSettings = {
    enabled: true,
    minOrderValue: 0,
    maxOrderValue: 50000,
    extraChargeType: 'flat',
    extraChargeValue: 0,
    allowAllPincodes: true,
    allowedPincodes: [],
    blockedPincodes: [],
    message: 'Cash on Delivery available'
  };

  const shippingSettings = owner.settings?.shippingSettings || defaultShippingSettings;
  const codSettings = owner.settings?.codSettings || defaultCodSettings;

  return res
    .status(200)
    .json(new ApiResponse(200, { shippingSettings, codSettings }, "Shipping configuration fetched successfully"));
});

// Get Shipping Settings
export const getShippingStats = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const owner = await Owner.findById(ownerId);

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  // initialize default if not present
  const defaultShippingSettings = {
    type: 'flat',
    flatRate: 0,
    freeShippingThreshold: 0,
    gstPercentage: 0,
    pickupPincode: "",
    priceBasedRules: []
  };

  const defaultCodSettings = {
    enabled: true,
    minOrderValue: 0,
    maxOrderValue: 50000,
    extraChargeType: 'flat',
    extraChargeValue: 0,
    allowAllPincodes: true,
    allowedPincodes: [],
    blockedPincodes: [], // Important for this task
    message: 'Cash on Delivery available'
  };

  const shippingSettings = owner.settings?.shippingSettings || defaultShippingSettings;
  const codSettings = owner.settings?.codSettings || defaultCodSettings;

  return res
    .status(200)
    .json(new ApiResponse(200, { shippingSettings, codSettings }, "Shipping settings fetched successfully"));
});

// Update Shipping Settings
export const toggleShipping = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const { shippingSettings, codSettings } = req.body; 

  const updateQuery = {};
  if (shippingSettings) updateQuery["settings.shippingSettings"] = shippingSettings;
  if (codSettings) updateQuery["settings.codSettings"] = codSettings;

  const owner = await Owner.findByIdAndUpdate(
    ownerId,
    { $set: updateQuery },
    { new: true }
  );

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { 
          shippingSettings: owner.settings.shippingSettings,
          codSettings: owner.settings.codSettings
        },
        "Shipping settings updated successfully"
      )
    );
});
