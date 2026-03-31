import Offer from "../../model/OfferModel.js";
import Product from "../../model/product.js";
import Category from "../../model/categoryModels.js";
import mongoose from "mongoose";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

// --- Helper Functions for Discount Management ---


// Get all offers with populated category or product
export const getOffers = async (req, res) => {
  try {
    const ownerId = req.owner?._id || req.user?.id;
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    const query = { ownerId };
    const { displayType } = req.query;

    if (displayType) {
      query.displayType = displayType;
    }

    // Check if the requester is the owner of the store
    const isOwner =
      req.user?.userType === "owner" && req.user.id === ownerId.toString();

    // If not the owner (i.e., public visitor or customer), show only active and non-expired offers
    if (!isOwner) {
      query.status = 'active';
      query.endDate = { $gt: new Date() };
    }

    const offers = await Offer.find(query)
      .lean() // Use lean() for faster read-only queries
      .populate("appliesToCategories", "categoryName") // populate category name
      .populate("appliesToProducts", "name") // populate product name
      .sort({ createdAt: -1 });

    res.json(offers);
  } catch (err) {
    console.error("❌ Error getting offers:", err);
    res
      .status(500)
      .json({
        error: err.message,
        message: "Failed to retrieve offers.",
        success: false,
      });
  }
};

// Get single offer by ID (Public)
export const getOfferById = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.owner?._id || req.user?.id;
    
    if (!ownerId) {
      return res.status(404).json({ message: "Store not found for this domain.", success: false });
    }

    const offer = await Offer.findOne({ _id: id, ownerId }).populate("appliesToCategories", "categoryName").populate("appliesToProducts", "name");
    if (!offer) {
      return res.status(404).json({ message: "Offer not found", success: false });
    }
    res.status(200).json({ data: offer, success: true });
  } catch (err) {
    console.error("Error getting offer by ID:", err);
    res.status(500).json({ error: err.message, message: "Failed to retrieve offer.", success: false });
  }
};

export const getTimeOffers = async (req, res) => {
  // Optimization: Scoped by ownerId and added active checks.
  try {
    const ownerId = req.owner?._id || req.user?.id;
    if (!ownerId) {
      return res.status(404).json({ message: "Store not found for this domain.", success: false });
    }

    const offer = await Offer.findOne({ displayType: "flash_sale", endDate: { $gt: new Date() }, ownerId, status: 'active' })
      .lean()
      .populate({ path: "appliesToCategories", select: "categoryName image" })
      .populate({ path: "appliesToProducts", select: "name images" })
      .sort({ createdAt: -1 });

    if (!offer) {
      return res.status(200).json({ data: null, message: "No active time-based offer found.", success: true });
    }

    // ✅ Determine image source (category or product)
    let image = null;
    if (offer.appliesToCategories?.[0]?.image) {
      image = offer.appliesToCategories[0].image;
    } else if (offer.appliesToProducts?.[0]?.images?.length > 0) {
      image = offer.appliesToProducts[0].images[0];
    }

    // Send response
    res.status(200).json({
      data: {
        ...offer,
        image,
      },
      message: "Time-based offer fetched successfully",
      success: true,
    });
  } catch (err) {
    console.error("❌ Error getting time-based offer:", err);
    res.status(500).json({
      error: err.message,
      message: "An internal server error occurred.",
      success: false,
    });
  }
};

// Get offers related to a product's category
export const getRelatedOffers = async (req, res) => {
  try {
    const { productId } = req.params;
    const ownerId = req.owner?._id || req.user?.id;

    if (!ownerId) {
      return res.status(404).json({ message: "Store not found for this domain.", success: false });
    }

    // 1. Find the product to get its categories
    const product = await Product.findById(productId).lean();
    if (!product || !product.category) {
      // If product not found or has no category, no related offers can be found
      return res.status(200).json({ data: [], success: true });
    }

    // 2. Find active, category-scoped offers that apply to the product's categories
    const relatedOffers = await Offer.find({
      appliesToCategories: product.category,
      endDate: { $gt: new Date() },
      ownerId,
      scope: 'category',
      status: 'active'
    }).populate("appliesToCategories", "categoryName").lean().sort({ createdAt: -1 });

    res.status(200).json({ data: relatedOffers, success: true });
  } catch (err) {
    console.error("❌ Error getting related offers:", err);
    res.status(500).json({ error: err.message, message: "Failed to retrieve related offers.", success: false });
  }
};

// Create a new offer
export const createOffer = async (req, res) => {
  const {
    categoryId,
    description,
    discount,
    endTime,
    expiry,
    offerCode,
    offerTimeType,
    productId,
    scope,
    startTime,
    title,
    offerType, // 'standard' (default) or 'combo'
    comboProducts, // Array of product IDs for combo offers
    status, // Added to receive status from frontend
  } = req.body;

  try {
    const ownerId = req.user.id;
    let startDate;
    let endDate;

    if (offerTimeType === 'flash_sale') {
      startDate = new Date(startTime);
      endDate = new Date(endTime);
      // For flash sales, expiry is the same as end time
    } else if (startTime && endTime) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [startHour, startMinute] = startTime.split(":").map(Number);
      startDate = new Date(today);
      startDate.setHours(startHour, startMinute);

      const [endHour, endMinute] = endTime.split(":").map(Number);
      endDate = new Date(today);
      endDate.setHours(endHour, endMinute);

      // If end time is earlier than start time, assume it's for the next day
      if (endDate <= startDate) {
        endDate.setDate(endDate.getDate() + 1);
      }
    } else if (startTime || endTime) {
      return res.status(400).json({
        message: "Both start time and end time must be provided, or neither.",
        success: false,
      });
    }

    // Validation for Combo Offers
    if (offerType === 'combo') {
      if (!comboProducts || !Array.isArray(comboProducts) || comboProducts.length < 2) {
        return res.status(400).json({
          message: "Combo offers must include at least 2 products.",
          success: false,
        });
      }
    } else if (categoryId && productId) {
      // Standard validation: An offer can be for a category OR a product, but not both.
      return res.status(400).json({
        message:
          "Offer can only be applied to a category OR a product, not both.",
        success: false,
      });
    }

    // Validate discount value
    if (discount <= 0 || discount > 100) {
      return res.status(400).json({
        message: "Discount must be between 1 and 100",
        success: false,
      });
    }

    // Check for existing active offers on the same product/category
    const existingOffer = await Offer.findOne({
      $or: [{ productId }, { categoryId }],
      isActive: true,
      ownerId,
    });
    if (existingOffer) {
      return res.status(409).json({ message: "An active offer already exists for this product or category.", success: false });
    }

    let product;
    let category;

    // Check if product/category exists and belongs to the owner
    if (productId) {
      product = await Product.findOne({ _id: productId, ownerId });
      if (!product) {
        return res.status(404).json({
          message: "Product not found or doesn't belong to you",
          success: false,
        });
      }
    }

    if (categoryId) {
      category = await Category.findOne({ _id: categoryId, ownerId });
      if (!category) {
        return res.status(404).json({
          message: "Category not found or doesn't belong to you",
          success: false,
        });
      }
    }

    // Create the offer
    const newOffer = new Offer({
      categoryId: categoryId || null,
      description,
      discount,
      endTime: endDate,
      expiry: offerTimeType === 'flash_sale' ? endDate : expiry,
      offerCode,
      offerTimeType,
      ownerId,
      productId: productId || null,
      scope,
      startTime: startDate,
      title,
      offerType: offerType || 'standard',
      comboProducts: offerType === 'combo' ? comboProducts : [],
      isActive: status === 'active', // Map frontend 'status' to backend 'isActive'
    });

    await newOffer.save();

    res.status(200).json({
      data: newOffer,
      message: "Offer created successfully",
      success: true,
    });
  } catch (err) {
    console.error("Create offer error:", err);
    res.status(500).json({
      error: err.message,
      message: "Failed to create. Offer could not be created",
      success: false,
    });
  }
};

// Update offer
export const updateOffer = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  const updateData = req.body;

  // Handle combo products update
  if (updateData.offerType === 'combo' && updateData.comboProducts) {
     // Ensure comboProducts is saved if provided
  }

  // If 'status' is in the update data, convert it to 'isActive' for the DB model
  if (updateData.status !== undefined) {
    updateData.isActive = updateData.status === 'active';
    delete updateData.status; // Remove the original 'status' field to avoid schema errors
  }

  // Handle date/time updates to ensure they are saved as Date objects
  if (updateData.offerTimeType === 'flash_sale') {
    if (updateData.startTime) {
      updateData.startTime = new Date(updateData.startTime);
    }
    if (updateData.endTime) {
      updateData.endTime = new Date(updateData.endTime);
      // For flash sales, expiry is the same as end time
      updateData.expiry = updateData.endTime;
    }
  } else if (updateData.offerTimeType === 'timeBased' && updateData.startTime && updateData.endTime) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [startHour, startMinute] = updateData.startTime.split(":").map(Number);
      updateData.startTime = new Date(today).setHours(startHour, startMinute);
      const [endHour, endMinute] = updateData.endTime.split(":").map(Number);
      const endDate = new Date(today).setHours(endHour, endMinute);
      if (endDate <= updateData.startTime) endDate.setDate(endDate.getDate() + 1);
      updateData.endTime = endDate;
  } else if (updateData.expiry) {
      updateData.expiry = new Date(updateData.expiry);
  }

  try {
    console.log(`Attempting to update offer. Offer ID: ${id}, Owner ID: ${ownerId}`); // Added for debugging
    const originalOffer = await Offer.findOne({ _id: id, ownerId }).lean();
    if (!originalOffer) {
      console.error(`Update failed: Offer with ID ${id} not found for owner ${ownerId}.`); // Added for debugging
      return res.status(404).json({ message: "Offer not found or you do not have permission to edit it.", success: false });
    }

    // 2. Update the offer document in the database
    const updatedOffer = await Offer.findByIdAndUpdate(id, { $set: updateData }, { new: true });

    res.status(200).json({ data: updatedOffer, message: "Offer updated successfully.", success: true });
  } catch (err) {
    console.error("❌ Error updating offer:", err);
    res.status(500).json({ error: err.message, message: "Failed to update offer.", success: false });
  }
};

// Delete offer
export const deleteOffer = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;

  try {
    const offer = await Offer.findOne({ _id: id, ownerId });
    if (!offer) {
      return res.status(404).json({ message: "Offer not found or you don't have permission to delete it.", success: false });
    }

    // Delete the offer document
    await Offer.findByIdAndDelete(id);

    res.status(200).json({ message: "Offer deleted successfully.", success: true });
  } catch (err) {
    console.error("❌ Error deleting offer:", err);
    res.status(500).json({ error: err.message, message: "Failed to delete offer.", success: false });
  }
};

export const resetExpiredOffersManually = async (req, res) => {
  try {
    const currentDate = new Date();
    const ownerId = getOwnerId(req);

    // If no owner can be identified from the domain or a logged-in user, do nothing.
    // This is a safeguard to prevent resetting offers for all stores.
    if (!ownerId) {
      return res.status(200).json({ message: "No store context found, no offers reset.", success: true });
    }

    const result = await Offer.updateMany(
      { expiry: { $lt: currentDate }, isActive: true, ownerId },
      { $set: { isActive: false } }
    );

    res.status(200).json({
      message: `Expired offers deactivated successfully. Count: ${result.modifiedCount}`,
      success: true,
    });
  } catch (err) {
    console.error("Error resetting expired offers:", err);
    res.status(500).json({
      error: err.message,
      message: "Failed to reset expired offers.",
      success: false,
    });
  }
};

export const resetExpiredOffers = resetExpiredOffersManually;
