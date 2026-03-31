import Product from "../../model/product.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

// Get all products (filtered by user's owner ID)
export const getAllProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this request.",
      });
    }

    const products = await Product.find({ ownerId, "flags.isBlocked": false })
      .populate("category", "categoryName");

    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
};

// Get product by ID (with owner ID validation)
export const GetProductById = async (req, res) => {
  try {
    const productId = req.params.id;
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this request.",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      ownerId,
      "flags.isBlocked": false,
    }).populate("category", "categoryName");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or not accessible",
      });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product",
      error: error.message,
    });
  }
};

export const GetTrendingProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this request.",
      });
    }

    const trendingProducts = await Product.find({
      ownerId,
      "flags.isTrending": true,
      "flags.isBlocked": false,
    })
      .sort({ "ratings.average": -1, "ratings.count": -1 })
      .limit(10)
      .populate("category", "categoryName");

    res.status(200).json(trendingProducts);
  } catch (error) {
    console.error("Error fetching trending products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching trending products",
      error: error.message,
    });
  }
};

// Get products by category (filtered by user's owner ID)
export const GetProductByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const ownerId = getOwnerId(req);

    if (!categoryId) {
      return res.status(400).json({ message: "Category ID is required" });
    }

    if (!ownerId) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this request.",
      });
    }

    const products = await Product.find({ category: categoryId, ownerId, "flags.isBlocked": false })
      .populate("category", "categoryName");

    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products by category",
      error: error.message,
    });
  }
};
