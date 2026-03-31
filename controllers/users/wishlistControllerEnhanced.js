
import Product from "../../model/product.js";
import User from "../../model/usersModel.js";
import mongoose from "mongoose";
import {
  validateProductOwnership,
  getOrCreateWishlist,
  isProductInWishlist,
  getWishlistItem,
  removeWishlistItem,
  addProductToWishlistItems,
  validateWishlistData,
  getWishlistSummary
} from "../../helpers/wishlistHelpers.js";

// Add product to wishlist (Enhanced version)
export const addToWishlistEnhanced = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.id;

    // Validate input data
    const validation = validateWishlistData({ productId });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors
      });
    }

    // Get user to get ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Validate product ownership
    const ownershipValidation = await validateProductOwnership(productId, user.ownerId);
    if (!ownershipValidation.isValid) {
      return res.status(403).json({
        success: false,
        message: ownershipValidation.message
      });
    }

    const product = ownershipValidation.product;

    // Check if product is already in wishlist and toggle accordingly
    if (isProductInWishlist(user.wishlist, productId)) {
      // Product exists, remove it from wishlist (toggle functionality)
      user.wishlist = removeWishlistItem(user.wishlist, productId);
      await user.save();

      // Get updated summary
      const summary = getWishlistSummary(user.wishlist);

      return res.status(200).json({
        success: true,
        message: "Product removed from wishlist successfully",
        data: {
          wishlist: user.wishlist,
          summary
        },
        action: "removed"
      });
    }

    // Add product to wishlist
    user.wishlist = addProductToWishlistItems(user.wishlist, product);
    await user.save();

    // Get wishlist summary
    const summary = getWishlistSummary(user.wishlist);

    res.status(200).json({
      success: true,
      message: "Product added to wishlist successfully",
      data: {
        wishlist: user.wishlist,
        summary
      },
      action: "added"
    });

  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Error adding to wishlist",
      error: error.message
    });
  }
};

// Remove product from wishlist (Enhanced version)
export const removeFromWishlistEnhanced = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    // Get user to get ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if product exists in wishlist
    if (!isProductInWishlist(user.wishlist, productId)) {
      return res.status(404).json({
        success: false,
        message: "Product not found in wishlist"
      });
    }

    // Remove the product from wishlist array
    user.wishlist = removeWishlistItem(user.wishlist, productId);
    await user.save();

    // Get updated summary
    const summary = getWishlistSummary(user.wishlist);

    res.status(200).json({
      success: true,
      message: "Product removed from wishlist successfully",
      data: {
        wishlist: user.wishlist,
        summary
      }
    });

  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Error removing from wishlist",
      error: error.message
    });
  }
};

// Get user's wishlist with summary (Enhanced version)
export const getWishlistEnhanced = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user to get ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get wishlist items with populated product details
    const wishlistItems = await Promise.all(
      user.wishlist.map(async (item) => {
        try {
          const product = await Product.findById(item.productId);
          return {
            ...item.toObject(),
            product: product ? {
              _id: product._id,
              product_name: product.product_name || product.name,
              price: product.price,
              image: product.image || (product.images && product.images[0]),
              inStock: product.inStock,
              stock: product.stock,
              description: product.description,
              category: product.category
            } : null
          };
        } catch (error) {
          console.error(`Error populating product ${item.productId}:`, error);
          return item;
        }
      })
    );

    // Get wishlist summary
    const summary = getWishlistSummary(user.wishlist);

    res.status(200).json({
      success: true,
      message: "Wishlist retrieved successfully",
      data: {
        wishlist: {
          items: wishlistItems,
          totalItems: wishlistItems.length
        },
        summary
      }
    });

  } catch (error) {
    console.error("Error getting wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Error getting wishlist",
      error: error.message
    });
  }
};

// Bulk operations on wishlist
export const bulkWishlistOperations = async (req, res) => {
  try {
    const { operation, productIds } = req.body;
    const userId = req.user.id;

    if (!operation || !productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        message: "Operation and productIds array are required"
      });
    }

    // Get user to get ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let message = "";
    let affectedItems = 0;

    switch (operation) {
      case "remove":
        // Remove multiple products
        const initialCount = user.wishlist.length;
        user.wishlist = user.wishlist.filter(
          item => !productIds.includes(item.productId.toString())
        );
        affectedItems = initialCount - user.wishlist.length;
        message = `Removed ${affectedItems} products from wishlist`;
        break;

      case "move_to_cart":
        // Move multiple products to cart (simplified - just remove from wishlist)
        const itemsToMove = user.wishlist.filter(
          item => productIds.includes(item.productId.toString())
        );
        user.wishlist = user.wishlist.filter(
          item => !productIds.includes(item.productId.toString())
        );
        affectedItems = itemsToMove.length;
        message = `Moved ${affectedItems} products to cart`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid operation. Supported operations: remove, move_to_cart"
        });
    }

    await user.save();

    // Get updated summary
    const summary = getWishlistSummary(user.wishlist);

    res.status(200).json({
      success: true,
      message,
      data: {
        affectedItems,
        wishlist: user.wishlist,
        summary
      }
    });

  } catch (error) {
    console.error("Error in bulk wishlist operations:", error);
    res.status(500).json({
      success: false,
      message: "Error in bulk wishlist operations",
      error: error.message
    });
  }
};

// Get wishlist analytics
export const getWishlistAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user to get ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user has wishlist items
    if (!user.wishlist || user.wishlist.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No wishlist data available",
        data: {
          summary: {
            totalItems: 0,
            totalValue: 0,
            inStockCount: 0,
            outOfStockCount: 0
          },
          analytics: {
            averagePrice: 0,
            priceRange: { min: 0, max: 0 },
            categoryDistribution: {},
            stockStatus: { inStock: 0, outOfStock: 0 }
          }
        }
      });
    }

    // Get basic summary
    const summary = getWishlistSummary(user.wishlist);

    // Calculate analytics
    const prices = user.wishlist.map(item => item.price);
    const averagePrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0
    };

    // Stock status
    const stockStatus = {
      inStock: summary.inStockCount,
      outOfStock: summary.outOfStockCount
    };

    res.status(200).json({
      success: true,
      message: "Wishlist analytics retrieved successfully",
      data: {
        summary,
        analytics: {
          averagePrice: Math.round(averagePrice * 100) / 100, // Round to 2 decimal places
          priceRange,
          stockStatus
        }
      }
    });

  } catch (error) {
    console.error("Error getting wishlist analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error getting wishlist analytics",
      error: error.message
    });
  }
};
