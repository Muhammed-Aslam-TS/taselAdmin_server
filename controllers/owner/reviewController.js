import Review from "../../model/reviewModel.js";
import User from "../../model/usersModel.js";
import Product from "../../model/product.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";
import { processBase64Image } from "../../middlewares/base64Convert.js";

export const createReviewByOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { productId, userId, rating, comment, images } = req.body;

    if (!productId || !userId || !rating || !comment) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Process base64 images if present
    let processedImages = [];
    if (images && Array.isArray(images)) {
      processedImages = await Promise.all(
        images.map(async (img) => {
          if (typeof img === "string" && img.startsWith("data:image")) {
            return await processBase64Image(img);
          }
          return img;
        })
      );
    }

    const review = await Review.create({
      productId,
      userId,
      ownerId,
      rating: Number(rating),
      comment,
      images: processedImages.filter(Boolean)
    });


    // Update product ratings
    const reviews = await Review.find({ productId });
    const numberOfReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

    const product = await Product.findById(productId);
    if (product) {
      product.numberOfReviews = numberOfReviews;
      product.averageRating = averageRating;
      await product.save({ validateBeforeSave: false });
    }

    res.status(201).json({ success: true, message: "Review created successfully", data: review });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};


export const getOwnerReviews = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const reviews = await Review.find({ ownerId })
      .sort({ createdAt: -1 })
      .populate("userId", "username email")
      .populate("productId", "title images");

    res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    console.error("Error fetching owner reviews:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

export const deleteReviewByOwner = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const ownerId = req.user.id;

    const review = await Review.findOne({ _id: reviewId, ownerId });

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found or unauthorized" });
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);

    // Update product ratings
    const reviews = await Review.find({ productId });
    const numberOfReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

    const product = await Product.findById(productId);
    if (product) {
        product.numberOfReviews = numberOfReviews;
        product.averageRating = averageRating;
        await product.save({ validateBeforeSave: false });
    }

    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

export const updateReviewByOwner = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment, images } = req.body;
    const ownerId = req.user.id;

    const review = await Review.findOne({ _id: reviewId, ownerId });

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found or unauthorized" });
    }

    const oldRating = review.rating;
    const productId = review.productId;

    if (rating !== undefined) review.rating = rating;
    if (comment !== undefined) review.comment = comment;
    if (images && Array.isArray(images)) {
      const processedImages = await Promise.all(
        images.map(async (img) => (img.startsWith("http") ? img : await processBase64Image(img)))
      );
      review.images = processedImages.filter(Boolean);
    }

    await review.save();

    // If rating was updated, update product ratings
    if (rating !== undefined && rating !== oldRating) {
      const reviews = await Review.find({ productId });
      const numberOfReviews = reviews.length;
      const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
      const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

      const product = await Product.findById(productId);
      if (product) {
        product.numberOfReviews = numberOfReviews;
        product.averageRating = averageRating;
        await product.save({ validateBeforeSave: false });
      }
    }

    res.status(200).json({ success: true, message: "Review updated successfully", data: review });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};


export const getHighRatedTestimonials = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    // Fetch reviews with rating >= 4
    const testimonials = await Review.find({
      ownerId: ownerId,
      rating: { $gte: 4 },
    })
      .sort({ createdAt: -1, rating: -1 }) // Sort by rating (desc) and then date (desc)
      .limit(10) // Limit to top 10 testimonials
      .populate("userId", "username") // Populate user details
      .populate("productId", "title images"); // Populate product details

    res.status(200).json({ data: testimonials, success: true });
  } catch (error) {
    console.error("Error fetching testimonials:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};