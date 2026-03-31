import Addon from "../../model/addonModels.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

// Get all addons for the user's store
export const getAddons = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this request.",
      });
    }

    // Find all addons for this owner
    const addons = await Addon.find({ ownerId }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: addons });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Error fetching addons",
        error: error.message,
      });
  }
};

// Get a single addon by ID
export const getAddonById = async (req, res) => {
  try {
    const { addonId } = req.params;
    const addon = await Addon.findById(addonId);

    if (!addon) {
      return res
        .status(404)
        .json({ success: false, message: "Addon not found" });
    }

    res.status(200).json({ success: true, data: addon });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Error fetching addon",
        error: error.message,
      });
  }
};
