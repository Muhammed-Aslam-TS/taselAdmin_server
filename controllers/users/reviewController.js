import Review from "../../model/reviewModel.js";
import { processBase64Image } from "../../middlewares/base64Convert.js";
import Product from "../../model/product.js";
import Owner from "../../model/OwnerModels.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";


export const createReview = async (req, res) => {
  try {
    const { Id } = req.params; // This is productId
    const { rating, comment, images } = req.body;
    const userId = req.user.id;

    const product = await Product.findById(Id);

    if (!product) {
      return res
        .status(404) // 404 is more appropriate for Not Found
        .json({ success: false, message: "Product not found" });
    }

    // Check if the user has already reviewed this product
    const existingReview = await Review.findOne({ productId: Id, userId: userId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const owner = await Owner.findById(product.ownerId);
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Owner not found" });
    }

    let processedImages = [];
    if (images && images.length > 0) {
      processedImages = await Promise.all(
        images.map((img) => processBase64Image(img))
      );
    }

    const review = await Review.create({
      productId: Id,
      userId: userId,
      ownerId: product.ownerId,
      rating,
      comment,
      images: processedImages,
    });

    // After creating review, update product's average rating and number of reviews
    const reviews = await Review.find({ productId: Id });
    const numberOfReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

    product.numberOfReviews = numberOfReviews;
    product.averageRating = averageRating;

    await product.save({ validateBeforeSave: false }); // validation is not required here

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      success: false,
      message: "Error creating review",
      error: error.message,
    });
  }
};


export const getProductReviews = async (req, res) => {
  try {
    const { Id } = req.params;
    const reviews = await Review.find({productId:Id}).populate("userId", "username email");
    const totalReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

    const ratings = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    reviews.forEach((review) => {
      ratings[review.rating] += 1;
    });

    res.status(200).json({
      success: true,
      totalReviews,
      averageRating,
      ratings,
      reviews,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching reviews",
      error: error.message,
    });
  }
};


export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // Check permissions: user must be the one who wrote it, or an owner/admin
    const isOwnerOrAdmin =
      req.user?.userType === "owner" || req.user?.userType === "admin";
    const isAuthor = review.userId.toString() === req.user.id;

    if (!isAuthor && !isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this review",
      });
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);

    // After deleting review, update product's average rating and number of reviews
    const reviews = await Review.find({ productId: productId });
    const numberOfReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

    const product = await Product.findById(productId);
    product.numberOfReviews = numberOfReviews;
    product.averageRating = averageRating;

    await product.save({ validateBeforeSave: false }); // validation is not required here

    res
      .status(200)
      .json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting review",
      error: error.message,
    });
  }
};


export const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment, images } = req.body;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own review",
      });
    }

    if (images && Array.isArray(images)) {
      const processedImages = await Promise.all(
        images.map((img) => (img.startsWith("http") ? img : processBase64Image(img)))
      );
      review.images = processedImages;
    }

    review.rating = rating || review.rating;
    review.comment = comment || review.comment;
    await review.save();

    const productId = review.productId;
    // After updating review, update product's average rating and number of reviews
    const reviews = await Review.find({ productId: productId });
    const numberOfReviews = reviews.length;
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    const averageRating = numberOfReviews > 0 ? totalRating / numberOfReviews : 0;

    const product = await Product.findById(productId);
    product.numberOfReviews = numberOfReviews;
    product.averageRating = averageRating;

    await product.save({ validateBeforeSave: false }); // validation is not required here

    res
      .status(200)
      .json({ success: true, message: "Review updated", data: review });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({
      success: false,
      message: "Error updating review",
      error: error.message,
    });
  }
};
export const getHighRatedTestimonials = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ success: false, message: "Store not found for this domain." });
    }

    // Fetch reviews with rating >= 4
    const testimonials = await Review.find({
      ownerId: ownerId,
      rating: { $gte: 4 },
    })
      .sort({ rating: -1, createdAt: -1 }) // Sort by rating (desc) and then date (desc)
      .limit(10) // Limit to top 10 testimonials
      .populate("userId", "username") // Populate user details
      .populate("productId", "title images"); // Populate product details

    res.status(200).json({ success: true, data: testimonials });
  } catch (error) {
    console.error("Error fetching testimonials:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};