import Testimonial from "../../model/testimonialModel.js";
import { processBase64Image } from "../../middlewares/base64Convert.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

// ====== OWNER DASHBOARD CONTROLLERS ======

export const createTestimonial = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { name, role, comment, rating, image } = req.body;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized. Owner ID missing." });
    }

    let processedImage = image;
    // Process base64 image if provided
    if (image && image.startsWith("data:image")) {
      processedImage = await processBase64Image(image);
    }

    const testimonial = await Testimonial.create({
      ownerId,
      name,
      role: role || "Customer",
      comment,
      rating: rating || 5,
      image: processedImage,
      isActive: true,
    });

    res.status(201).json({ success: true, message: "Testimonial created successfully.", data: testimonial });
  } catch (error) {
    console.error("Error creating testimonial:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getOwnerTestimonials = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const testimonials = await Testimonial.find({ ownerId }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: testimonials });
  } catch (error) {
    console.error("Error fetching admin testimonials:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const updateTestimonial = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { name, role, comment, rating, image, isActive } = req.body;

    const testimonial = await Testimonial.findOne({ _id: id, ownerId });

    if (!testimonial) {
      return res.status(404).json({ success: false, message: "Testimonial not found." });
    }

    let processedImage = testimonial.image;
    // If a new base64 image is uploaded, process it
    if (image && image.startsWith("data:image")) {
      processedImage = await processBase64Image(image);
    } else if (image !== undefined) {
      processedImage = image; // allow clearing image by sending empty string null
    }

    testimonial.name = name !== undefined ? name : testimonial.name;
    testimonial.role = role !== undefined ? role : testimonial.role;
    testimonial.comment = comment !== undefined ? comment : testimonial.comment;
    testimonial.rating = rating !== undefined ? rating : testimonial.rating;
    testimonial.image = processedImage;
    testimonial.isActive = isActive !== undefined ? isActive : testimonial.isActive;

    await testimonial.save();

    res.status(200).json({ success: true, message: "Testimonial updated.", data: testimonial });
  } catch (error) {
    console.error("Error updating testimonial:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const deleteTestimonial = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const testimonial = await Testimonial.findOneAndDelete({ _id: id, ownerId });

    if (!testimonial) {
      return res.status(404).json({ success: false, message: "Testimonial not found." });
    }

    res.status(200).json({ success: true, message: "Testimonial deleted successfully." });
  } catch (error) {
    console.error("Error deleting testimonial:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const toggleTestimonialStatus = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const testimonial = await Testimonial.findOne({ _id: id, ownerId });

    if (!testimonial) {
      return res.status(404).json({ success: false, message: "Testimonial not found." });
    }

    testimonial.isActive = !testimonial.isActive;
    await testimonial.save();

    res.status(200).json({ success: true, message: "Status toggled.", data: testimonial });
  } catch (error) {
    console.error("Error toggling testimonial status:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ====== PUBLIC STOREFRONT CONTROLLER ======

export const getPublicTestimonials = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({ success: false, message: "Store not found." });
    }

    // Usually public should only see active ones and maybe a limit
    const limit = parseInt(req.query.limit) || 10;

    const testimonials = await Testimonial.find({ ownerId, isActive: true })
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit);

    res.status(200).json({ success: true, data: testimonials });
  } catch (error) {
    console.error("Error fetching public testimonials:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
