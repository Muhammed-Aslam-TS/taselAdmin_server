
import Product from "../../model/product.js";
import User from "../../model/usersModel.js";
import mongoose from "mongoose";

// Add product to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    console.log("addToWishlist", productId);
    const userId = req.user.id;
    console.log(userId, "userId;;;;;;;;;;;;");

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    // Validate product ID
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

    // Check if product exists and belongs to the same owner
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (product.ownerId.toString() !== user.ownerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Product not accessible"
      });
    }

    // Check if product is already in wishlist
    const existingItem = user.wishlist.find(
      item => item.productId.toString() === productId
    );

    if (existingItem) {
      // Product already exists, remove it from wishlist (toggle functionality)
      user.wishlist = user.wishlist.filter(
        item => item.productId.toString() !== productId
      );
      
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Product removed from wishlist successfully",
        data: user.wishlist,
        action: "removed"
      });
    }

    // console.log("product______________", product);
    // console.log("user______________", user);

    const wishlistItem = {
      productId: product._id,
      product_name: product.name || product.product_name,
      price: product.price,
      image: Array.isArray(product.images) ? product.images[0] : product.images,
      inStock: product.inStock
    }

    // Add item to wishlist
    user.wishlist.push(wishlistItem);

    await user.save();

    res.status(200).json({
      success: true,
      message: "Product added to wishlist successfully",
      data: user.wishlist,
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

// Remove product from wishlist
export const removeFromWishlist = async (req, res) => {
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
    const existingItem = user.wishlist.find(
      item => item.productId.toString() === productId
    );

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in wishlist"
      });
    }

    // Remove the product from wishlist array
    user.wishlist = user.wishlist.filter(
      item => item.productId.toString() !== productId
    );

    await user.save();

    res.status(200).json({
      success: true,
      message: "Product removed from wishlist successfully",
      data: user.wishlist
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

// Get user's wishlist
export const getWishlist = async (req, res) => {
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
              product_name: product.name || product.product_name,
              price: product.price,
              image: product.images && product.images.length > 0 ? product.images[0] : product.image,
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

    res.status(200).json({
      success: true,
      message: "Wishlist retrieved successfully",
      data: {
        items: wishlistItems,
        totalItems: wishlistItems.length
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

// Clear entire wishlist
export const clearWishlist = async (req, res) => {
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

    // Clear all wishlist items
    user.wishlist = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
      data: { items: [] }
    });

  } catch (error) {
    console.error("Error clearing wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing wishlist",
      error: error.message
    });
  }
};

// Move wishlist item to cart
export const moveToCart = async (req, res) => {
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

    // Find the item in wishlist
    const wishlistItem = user.wishlist.find(
      item => item.productId.toString() === productId
    );

    if (!wishlistItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in wishlist"
      });
    }

    // Check if product is already in cart
    const existingCartItem = user.cart.items.find(
      item => item.productId.toString() === productId
    );

    if (existingCartItem) {
      return res.status(400).json({
        success: false,
        message: "Product already in cart"
      });
    }

    // Add to cart
    user.cart.items.push({
      productId: wishlistItem.productId,
      product_name: wishlistItem.product_name,
      price: wishlistItem.price,
      image: wishlistItem.image,
      quantity: 1,
      inStock: wishlistItem.inStock,
    });

    // Remove from wishlist
    user.wishlist = user.wishlist.filter(
      item => item.productId.toString() !== productId
    );

    // Save the updated user
    await user.save();

    res.status(200).json({
      success: true,
      message: "Product moved to cart successfully",
      data: {
        cart: user.cart,
        wishlist: user.wishlist
      }
    });

  } catch (error) {
    console.error("Error moving to cart:", error);
    res.status(500).json({
      success: false,
      message: "Error moving to cart",
      error: error.message
    });
  }
};

// Get wishlist count
export const getWishlistCount = async (req, res) => {
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

    const count = user.wishlist ? user.wishlist.length : 0;

    res.status(200).json({
      success: true,
      message: "Wishlist count retrieved successfully",
      data: { count }
    });

  } catch (error) {
    console.error("Error getting wishlist count:", error);
    res.status(500).json({
      success: false,
      message: "Error getting wishlist count",
      error: error.message
    });
  }
};

// Check if product is in wishlist
export const checkWishlistStatus = async (req, res) => {
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

    const isInWishlist = user.wishlist ? 
      user.wishlist.some(item => item.productId.toString() === productId) : 
      false;

    res.status(200).json({
      success: true,
      message: "Wishlist status checked successfully",
      data: { isInWishlist }
    });

  } catch (error) {
    console.error("Error checking wishlist status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking wishlist status",
      error: error.message
    });
  }
};
