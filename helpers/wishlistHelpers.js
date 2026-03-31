import mongoose from "mongoose";
import Product from "../model/product.js";

// Helper function to validate product ownership
export const validateProductOwnership = async (productId, ownerId) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return { isValid: false, message: "Product not found" };
    }
    
    if (product.ownerId.toString() !== ownerId.toString()) {
      return { isValid: false, message: "Product not accessible" };
    }
    
    return { isValid: true, product };
  } catch (error) {
    return { isValid: false, message: "Error validating product", error };
  }
};

// Helper function to get or create wishlist
export const getOrCreateWishlist = async (userId, ownerId) => {
  try {
    // Since we're using user.wishlist array directly, this function is no longer needed
    // but kept for backward compatibility
    return { success: true, wishlist: null };
  } catch (error) {
    return { success: false, message: "Error getting/creating wishlist", error };
  }
};

// Helper function to check if product exists in wishlist
export const isProductInWishlist = (wishlist, productId) => {
  if (!wishlist || !Array.isArray(wishlist)) return false;
  
  return wishlist.some(
    item => item.productId.toString() === productId.toString()
  );
};

// Helper function to get wishlist item by product ID
export const getWishlistItem = (wishlist, productId) => {
  if (!wishlist || !Array.isArray(wishlist)) return null;
  
  return wishlist.find(
    item => item.productId.toString() === productId.toString()
  );
};

// Helper function to remove wishlist item by product ID
export const removeWishlistItem = (wishlist, productId) => {
  if (!wishlist || !Array.isArray(wishlist)) return wishlist;
  
  return wishlist.filter(
    item => item.productId.toString() !== productId.toString()
  );
};

// Helper function to add product to wishlist items
export const addProductToWishlistItems = (wishlist, product) => {
  if (!Array.isArray(wishlist)) {
    wishlist = [];
  }
  
  const wishlistItem = {
    productId: product._id,
    product_name: product.name || product.product_name,
    price: product.price,
    image: Array.isArray(product.images) ? product.images[0] : product.images,
    inStock: product.inStock,
    addedAt: new Date()
  };
  
  wishlist.push(wishlistItem);
  return wishlist;
};

// Helper function to toggle product in wishlist (add if not exists, remove if exists)
export const toggleWishlistItem = (wishlist, product) => {
  if (!Array.isArray(wishlist)) {
    wishlist = [];
  }
  
  const existingIndex = wishlist.findIndex(
    item => item.productId.toString() === product._id.toString()
  );
  
  if (existingIndex !== -1) {
    // Product exists, remove it
    wishlist.splice(existingIndex, 1);
    return { wishlist, action: "removed" };
  } else {
    // Product doesn't exist, add it
    const wishlistItem = {
      productId: product._id,
      product_name: product.name || product.product_name,
      price: product.price,
      image: Array.isArray(product.images) ? product.images[0] : product.images,
      inStock: product.inStock,
      addedAt: new Date()
    };
    
    wishlist.push(wishlistItem);
    return { wishlist, action: "added" };
  }
};

// Helper function to validate wishlist data
export const validateWishlistData = (data) => {
  const errors = [];
  
  if (!data.productId) {
    errors.push("Product ID is required");
  }
  
  if (data.productId && !mongoose.Types.ObjectId.isValid(data.productId)) {
    errors.push("Invalid product ID format");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Helper function to get wishlist summary
export const getWishlistSummary = (wishlist) => {
  if (!wishlist || !Array.isArray(wishlist)) {
    return {
      totalItems: 0,
      totalValue: 0,
      inStockCount: 0,
      outOfStockCount: 0
    };
  }
  
  const summary = wishlist.reduce((acc, item) => {
    acc.totalItems++;
    acc.totalValue += item.price;
    
    if (item.inStock) {
      acc.inStockCount++;
    } else {
      acc.outOfStockCount++;
    }
    
    return acc;
  }, {
    totalItems: 0,
    totalValue: 0,
    inStockCount: 0,
    outOfStockCount: 0
  });
  
  return summary;
};
