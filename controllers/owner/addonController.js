import Addon from "../../model/addonModels.js";
import Product from "../../model/product.js";

/**
 * Create a new addon for the logged-in owner.
 */
export const createAddon = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { name, price, description } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: "Name and price are required." });
    }

    const addon = await Addon.create({
      name,
      price,
      description,
      ownerId,
    });

    res.status(201).json({ success: true, message: "Addon created successfully.", data: addon });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating addon.", error: error.message });
  }
};

/**
 * Get all addons for the logged-in owner.
 */
export const getAddonsByOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const addons = await Addon.find({ ownerId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: addons });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching addons.", error: error.message });
  }
};

/**
 * Update an existing addon.
 */
export const updateAddon = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { addonId } = req.params;
    const { name, price, description } = req.body;

    const addon = await Addon.findOneAndUpdate(
      { _id: addonId, ownerId },
      { name, price, description },
      { new: true, runValidators: true }
    );

    if (!addon) {
      return res.status(404).json({ success: false, message: "Addon not found or you do not have permission to update it." });
    }

    res.status(200).json({ success: true, message: "Addon updated successfully.", data: addon });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating addon.", error: error.message });
  }
};

/**
 * Delete an addon.
 */
export const deleteAddon = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { addonId } = req.params;

    const addon = await Addon.findOneAndDelete({ _id: addonId, ownerId });

    if (!addon) {
      return res.status(404).json({ success: false, message: "Addon not found or you do not have permission to delete it." });
    }

    // Also remove this addon from any products that use it
    await Product.updateMany(
      { ownerId, addons: addonId },
      { $pull: { addons: addonId } }
    );

    res.status(200).json({ success: true, message: "Addon deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting addon.", error: error.message });
  }
};

/**
 * Assign a list of addons to a product.
 */
export const assignAddonsToProduct = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { productId } = req.params;
    const { addonIds } = req.body; // Expecting an array of addon IDs

    if (!Array.isArray(addonIds)) {
      return res.status(400).json({ success: false, message: "addonIds must be an array." });
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, ownerId },
      { $addToSet: { addons: { $each: addonIds } } }, // Use $addToSet to avoid duplicates
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    res.status(200).json({ success: true, message: "Addons assigned successfully.", data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error assigning addons.", error: error.message });
  }
};

/**
 * Remove a specific addon from a product.
 */
export const removeAddonFromProduct = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { productId, addonId } = req.params;

    const product = await Product.findOneAndUpdate(
      { _id: productId, ownerId },
      { $pull: { addons: addonId } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    res.status(200).json({ success: true, message: "Addon removed from product successfully.", data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error removing addon from product.", error: error.message });
  }
};