import Banner from "../../model/bannerModel.js"; // Make sure this path is correct
import { processBase64Image, deleteFromFirebase } from "../../middlewares/base64Convert.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

/**
 * Get all banners for the current owner, sorted by position.
 * (For owner dashboard)
 */
export const getBanners = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const banners = await Banner.find({ ownerId }).sort({ position: "asc" });
    res.status(200).json({ data: banners, success: true });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ message: "Failed to fetch banners.", success: false });
  }
};

/**
 * Get all active banners for the current store.
 * (For public user-facing site)
 */
export const getStoreBanners = async (req, res) => {
  try {
    // getOwnerId helper resolves owner from domain for public routes
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res.status(404).json({ message: "Store not found.", success: false });
    }
    const now = new Date();
    const banners = await Banner.find({
      ownerId,
      isActive: true,
      section: "hero",
      // Ensure the banner is currently active based on its date range
      startDate: { $lte: now },
      $or: [{ endDate: { $gte: now } }, { endDate: null }], // Active if end date is in the future or not set
    }).sort({ position: "asc" });

    res.status(200).json({ data: banners, success: true });
  } catch (error) {
    console.error("Error fetching store banners:", error);
    res.status(500).json({ message: "Failed to fetch banners.", success: false });
  }
};

/**
 * Get all active banners for the category section.
 * (For public user-facing site)
 */
export const getCategoryBanners = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res.status(404).json({ message: "Store not found.", success: false });
    }
    const now = new Date();
    const banners = await Banner.find({
      ownerId,
      isActive: true,
      section: "category",
      startDate: { $lte: now },
      $or: [{ endDate: { $gte: now } }, { endDate: null }],
    }).sort({ position: "asc" });

    res.status(200).json({ data: banners, success: true });
  } catch (error) {
    console.error("Error fetching category banners:", error);
    res.status(500).json({ message: "Failed to fetch category banners.", success: false });
  }
};

/**
 * Get a single banner by its ID.
 * (For owner dashboard)
 */
export const getBannerById = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { bannerId } = req.params;

    const banner = await Banner.findOne({ _id: bannerId, ownerId });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found." });
    }

    res.status(200).json({ data: banner, success: true });
  } catch (error) {
    console.error("Error fetching banner by ID:", error);
    res.status(500).json({ message: "Failed to fetch banner.", success: false });
  }
};

/**
 * Create a new banner.
 */
export const createBanner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { description, endDate, image, isActive, link, startDate, title, section } = req.body;

    if (!title || !image) {
      return res.status(400).json({ message: "Title and image are required." });
    }

    const imageUrl = await processBase64Image(image);
    if (!imageUrl) {
      return res.status(400).json({ message: "Invalid image data." });
    }

    const bannerCount = await Banner.countDocuments({ ownerId });

    const newBanner = new Banner({
      title,
      description,
      link,
      image: imageUrl,
      isActive,
      startDate,
      endDate,
      ownerId,
      position: bannerCount, // Add to the end
      section: section || "hero",
    });

    await newBanner.save();
    res.status(201).json({ data: newBanner, message: "Banner created successfully.", success: true });
  } catch (error) {
    console.error("Error creating banner:", error);
    res.status(500).json({ message: "Failed to create banner.", success: false });
  }
};

/**
 * Update an existing banner.
 */
export const updateBanner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { bannerId } = req.params;
    const updateData = { ...req.body };

    // If a new image is provided (as base64), process it
    if (updateData.image && updateData.image.startsWith('data:image')) {
      const imageUrl = await processBase64Image(updateData.image);
      if (imageUrl) {
        // Delete old image
        const existingBanner = await Banner.findOne({ _id: bannerId, ownerId });
        if (existingBanner && existingBanner.image) {
          await deleteFromFirebase(existingBanner.image);
        }
        updateData.image = imageUrl;
      } else {
        delete updateData.image; // Don't update if processing fails
      }
    }

    const updatedBanner = await Banner.findOneAndUpdate(
      { _id: bannerId, ownerId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedBanner) {
      return res.status(404).json({ message: "Banner not found or you don't have permission." });
    }

    res.status(200).json({ success: true, message: "Banner updated successfully.", data: updatedBanner });
  } catch (error) {
    console.error("Error updating banner:", error);
    res.status(500).json({ message: "Failed to update banner.", success: false });
  }
};

/**
 * Delete a banner.
 */
export const deleteBanner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { bannerId } = req.params;

    const deletedBanner = await Banner.findOneAndDelete({ _id: bannerId, ownerId });

    if (!deletedBanner) {
      return res.status(404).json({ message: "Banner not found or you don't have permission." });
    }

    // Delete image from Firebase
    if (deletedBanner.image) {
      await deleteFromFirebase(deletedBanner.image);
    }

    res.status(200).json({ success: true, message: "Banner deleted successfully." });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ message: "Failed to delete banner.", success: false });
  }
};

/**
 * Updates the display order of all banners.
 * Expects a body with { orderedIds: ["id1", "id2", "id3", ...] }
 */
export const updateBannerOrder = async (req, res) => {
  try {
    const ownerId = req.user.id; // Secure this to the logged-in user
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: "Invalid data format. Expected an array of banner IDs." });
    }

    // Use bulkWrite for an efficient multi-document update.
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, ownerId: ownerId }, // Ensure owner can only update their own banners
        // Set the position field based on the array index
        update: { $set: { position: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await Banner.bulkWrite(bulkOps);
    }

    res.status(200).json({ success: true, message: "Banner order updated successfully." });
  } catch (error) {
    console.error("Error updating banner order:", error);
    res.status(500).json({ message: "Failed to update banner order.", success: false });
  }
};