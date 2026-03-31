import Partner from "../../model/partnerModel.js";
import { processBase64Image } from "../../middlewares/base64Convert.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

// ====== OWNER DASHBOARD CONTROLLERS ======

export const createPartner = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { name, websiteUrl, description, image } = req.body;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized. Owner ID missing." });
    }

    if (!name || !image) {
      return res.status(400).json({ success: false, message: "Name and Image are required." });
    }

    let processedImage = image;
    // Process base64 image if provided
    if (image && image.startsWith("data:image")) {
      processedImage = await processBase64Image(image);
    }

    const partner = await Partner.create({
      ownerId,
      name,
      websiteUrl: websiteUrl || "",
      description: description || "",
      image: processedImage,
      isActive: true,
    });

    res.status(201).json({ success: true, message: "Partner created successfully.", data: partner });
  } catch (error) {
    console.error("Error creating partner:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getOwnerPartners = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const partners = await Partner.find({ ownerId }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: partners });
  } catch (error) {
    console.error("Error fetching admin partners:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const updatePartner = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { name, websiteUrl, description, image, isActive } = req.body;

    const partner = await Partner.findOne({ _id: id, ownerId });

    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found." });
    }

    let processedImage = partner.image;
    // If a new base64 image is uploaded, process it
    if (image && image.startsWith("data:image")) {
      processedImage = await processBase64Image(image);
    } else if (image !== undefined) {
      processedImage = image; // allow clearing image
    }

    partner.name = name !== undefined ? name : partner.name;
    partner.websiteUrl = websiteUrl !== undefined ? websiteUrl : partner.websiteUrl;
    partner.description = description !== undefined ? description : partner.description;
    partner.image = processedImage;
    partner.isActive = isActive !== undefined ? isActive : partner.isActive;

    await partner.save();

    res.status(200).json({ success: true, message: "Partner updated.", data: partner });
  } catch (error) {
    console.error("Error updating partner:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const deletePartner = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const partner = await Partner.findOneAndDelete({ _id: id, ownerId });

    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found." });
    }

    res.status(200).json({ success: true, message: "Partner deleted successfully." });
  } catch (error) {
    console.error("Error deleting partner:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const togglePartnerStatus = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const partner = await Partner.findOne({ _id: id, ownerId });

    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found." });
    }

    partner.isActive = !partner.isActive;
    await partner.save();

    res.status(200).json({ success: true, message: "Status toggled.", data: partner });
  } catch (error) {
    console.error("Error toggling partner status:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ====== PUBLIC STOREFRONT CONTROLLER ======

export const getPublicPartners = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({ success: false, message: "Store not found." });
    }

    const partners = await Partner.find({ ownerId, isActive: true })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: partners });
  } catch (error) {
    console.error("Error fetching public partners:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
