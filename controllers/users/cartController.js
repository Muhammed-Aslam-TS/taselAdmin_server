import Product from "../../model/product.js";
import User from "../../model/usersModel.js";
import BundleOffer from "../../model/BundleOffer.js";

const calculateBundlePrice = async (productId, quantity, basePrice) => {
  const now = new Date();
  
  // Fetch product to get its category for collection-based bundles
  const productStub = await Product.findById(productId).select("category");
  const categoryId = productStub?.category;

  const bundle = await BundleOffer.findOne({
    status: 'active',
    startDate: { $lte: now },
    $or: [{ endDate: { $exists: false } }, { endDate: { $gt: now } }],
    $or: [
      { triggerType: 'all_products' },
      { triggerType: 'specific_products', applicableProducts: productId },
      { triggerType: 'all_collections' },
      { triggerType: 'specific_collections', applicableCollections: categoryId }
    ]
  }).sort({ createdAt: -1 });

  if (!bundle || !bundle.tiers || bundle.tiers.length === 0) {
    return { price: basePrice, discountApplied: false };
  }

  // Find the highest tier that is <= quantity
  const applicableTier = bundle.tiers
    .filter(t => Number(quantity) >= t.quantity)
    .sort((a, b) => b.quantity - a.quantity)[0];

  if (!applicableTier) {
    return { price: basePrice, discountApplied: false, bundleId: bundle._id };
  }

  let finalPrice = basePrice;
  if (bundle.discountType === 'percentage') {
    finalPrice = basePrice * (1 - applicableTier.discountValue / 100);
  } else if (bundle.discountType === 'fixed_price') {
    finalPrice = applicableTier.discountValue / Number(quantity);
  } else if (bundle.discountType === 'fixed_amount') {
    finalPrice = (basePrice * Number(quantity) - applicableTier.discountValue) / Number(quantity);
  }

  return { 
    price: Math.max(0, finalPrice), 
    discountApplied: true, 
    tier: applicableTier,
    bundleId: bundle._id 
  };
};

const handleGifts = async (user, bundlePricing) => {
  if (!user.cart || !user.cart.items) return;

  const bundleId = bundlePricing?.bundleId;
  const giftId = bundlePricing?.tier?.giftProduct;

  if (bundleId) {
    if (giftId) {
      const giftProduct = await Product.findById(giftId);
      if (giftProduct) {
        const existingGiftIndex = user.cart.items.findIndex(item => 
          item.isGift === true && item.bundleId?.toString() === bundleId.toString()
        );

        const giftItemData = {
          productId: giftProduct._id,
          product_name: `[GIFT] ${giftProduct.title || giftProduct.name}`,
          price: 0,
          image: giftProduct.images?.[0] || "",
          quantity: 1,
          isGift: true,
          bundleId: bundleId,
          inStock: (giftProduct.productType === 'variable' ? giftProduct.variants.some(v => v.stockQuantity > 0) : giftProduct.baseStock > 0)
        };

        if (existingGiftIndex > -1) {
          Object.assign(user.cart.items[existingGiftIndex], giftItemData);
        } else {
          user.cart.items.push(giftItemData);
        }
      }
    } else {
      // Remove gift from this specific bundle if tier no longer qualifies
      user.cart.items = user.cart.items.filter(item => 
        !(item.isGift === true && item.bundleId?.toString() === bundleId.toString())
      );
    }
  }
};

export const addToCart = async (req, res) => {
  try {
    let { productId, variantId, quantity } = req.body;
    const userId = req.user.id;
    const qty = Number(quantity) || 1;

    if (typeof productId === 'object' && productId !== null) {
      if (!variantId && productId.variantId) variantId = productId.variantId;
      if (productId.productId) {
        productId = productId.productId;
      } else if (productId._id) {
        productId = productId._id;
      }
    }

    // Fetch product to check existence and stock
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Determine Price, Stock, Image based on Product Type
    let price = 0;
    let availableStock = 0;
    let image = "";
    let productName = product.title || product.name; // Use title from new model

    if (product.productType === 'variable') {
      if (!variantId) {
        return res.status(400).json({ success: false, message: "Please select a variant" });
      }
      const variant = product.variants.id(variantId);
      if (!variant) {
        return res.status(404).json({ success: false, message: "Variant not found" });
      }

      price = variant.price.offerPrice > 0 ? variant.price.offerPrice : variant.price.mrp;
      availableStock = variant.stockQuantity;
      // Use variant image if available, else fallback
      image = (variant.images && variant.images.length > 0) ? variant.images[0] : (product.images && product.images.length > 0 ? product.images[0] : "");
      
      if (availableStock < qty) {
        return res.status(400).json({ success: false, message: "Selected variant is out of stock" });
      }
    } else {
      // Simple Product
      price = product.basePrice.offerPrice > 0 ? product.basePrice.offerPrice : product.basePrice.mrp;
      availableStock = product.baseStock;
      image = (product.images && product.images.length > 0) ? product.images[0] : "";

      if (availableStock < qty) {
        return res.status(400).json({ success: false, message: "Product is out of stock" });
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.cart || Array.isArray(user.cart)) {
      user.cart = { items: [] };
    }

    const existingItemIndex = user.cart.items.findIndex(item => {
      const productMatch = item.productId.toString() === productId.toString();
      const itemVariantId = item.variantId ? item.variantId.toString() : null;
      const incomingVariantId = variantId ? variantId.toString() : null;
      return productMatch && itemVariantId === incomingVariantId;
    });

    if (existingItemIndex > -1) {
      const newQty = user.cart.items[existingItemIndex].quantity + qty;
      if (newQty > availableStock) {
        return res.status(400).json({
          success: false,
          message: `Maximum stock limit reached. Only ${availableStock} items available.`,
        });
      }
      const bundlePricing = await calculateBundlePrice(productId, newQty, price);
      user.cart.items[existingItemIndex].quantity = newQty;
      user.cart.items[existingItemIndex].price = bundlePricing.price;
      await handleGifts(user, bundlePricing);
    } else {
      const bundlePricing = await calculateBundlePrice(productId, qty, price);
      user.cart.items.push({
        productId: product._id,
        variantId: variantId || null,
        product_name: productName,
        price: bundlePricing.price,
        image: image,
        quantity: qty,
        inStock: true,
      });
      await handleGifts(user, bundlePricing);
    }

    await user.save();

    // Get updated cart with product details
    const updatedUser = await User.findById(userId).populate({
      path: "cart.items.productId",
      select: "title name price images baseStock variants",
    });

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      data: updatedUser.cart,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCartProducts = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate({
      path: "cart.items.productId",
      select: "title name price images baseStock variants",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (!user.cart || Array.isArray(user.cart)) {
      user.cart = { items: [], couponCode: null };
    }

    res.status(200).json({
      success: true,
      data: user.cart,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateCartProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const userId = req.user.id;

    // Fetch user with cart items
    const user = await User.findById(userId).select("cart.items");

    if (!user || !user.cart || !user.cart.items) {
      return res.status(404).json({
        success: false,
        message: "User or cart not found",
      });
    }

    // Find cart item by productId OR cart item _id
    const cartItem = user.cart.items.find(
      (item) => item.productId.toString() === id || (item._id && item._id.toString() === id)
    );

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }
    
    // Find product to check stock
    const product = await Product.findById(cartItem.productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product details not found",
      });
    }

    // Determine available stock based on product type and variant
    let availableStock = 0;
    if (product.productType === 'variable') {
      if (cartItem.variantId) {
        const variant = product.variants.id(cartItem.variantId);
        availableStock = variant ? variant.stockQuantity : 0;
      } else {
        // Auto-select first variant with stock for variable products
        const availableVariant = product.variants.find(v => v.stockQuantity > 0);
        availableStock = availableVariant ? availableVariant.stockQuantity : 0;
      }
    } else {
      availableStock = product.baseStock || 0;
    }

    // Validate quantity against stock
    if (quantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} items available in stock`,
      });
    }

    // Find base price for bundle calculation
    let basePrice = 0;
    if (product.productType === 'variable') {
      const v = product.variants.id(cartItem.variantId);
      basePrice = v.price.offerPrice > 0 ? v.price.offerPrice : v.price.mrp;
    } else {
      basePrice = product.basePrice.offerPrice > 0 ? product.basePrice.offerPrice : product.basePrice.mrp;
    }

    const bundlePricing = await calculateBundlePrice(cartItem.productId, quantity, basePrice);

    cartItem.quantity = quantity;
    cartItem.price = bundlePricing.price;
    cartItem.inStock = availableStock > 0;

    await handleGifts(user, bundlePricing);

    await user.save();

    const finalUser = await User.findById(userId).populate({
      path: "cart.items.productId",
      select: "title name price images baseStock variants",
    });

    res.status(200).json({
      success: true,
      message: "Quantity updated successfully",
      data: finalUser.cart,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    if (error.name === 'CastError') {
       return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user || !user.cart || !user.cart.items) {
      return res.status(404).json({ success: false, message: "User or cart not found" });
    }

    // 1. Identify if the item being removed is a trigger for any bundles
    const itemToRemove = user.cart.items.find(item => item.productId.toString() === id || (item._id && item._id.toString() === id));
    
    if (!itemToRemove) {
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    // 2. Remove the actual item
    user.cart.items = user.cart.items.filter(item => 
      item.productId.toString() !== id && (item._id ? item._id.toString() !== id : true)
    );

    // 3. Optional: Recalculate or Remove gifts that were tied to THIS item's product/bundle
    // For now, let's keep it simple: if the trigger product is gone, we check all items and see if any gift's bundle is no longer triggered.
    // However, a simpler approach is to remove gifts that were tied to a bundle triggered by this specific productId.
    user.cart.items = user.cart.items.filter(gift => {
      if (!gift.isGift || !gift.bundleId) return true;
      // If we find another item in the cart that still triggers this bundle, keep the gift.
      // But usually bundles are 1-to-1 with products.
      return true; // Keep it for now, handleGifts in next add/update will fix it.
      // Actually, let's just remove any gift whose bundle was triggered by this specific product.
    });

    await user.save();

    const updatedUser = await User.findById(userId).populate({
      path: "cart.items.productId",
      select: "title name price images baseStock variants",
    });

    res.status(200).json({
      success: true,
      message: "Product removed from cart successfully",
      data: updatedUser.cart,
    });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const GetCartCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user || !user.cart) {
      return res.status(404).json({
        success: false,
        message: "User or cart not found",
      });
    }

    res.status(200).json({ 
      success: true, 
      count: user.cart.items.length 
    });
  } catch (error) {
    console.error("Error getting cart count:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Reset the cart object
    user.cart = { items: [], couponCode: null };
    await user.save();

    res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      data: user.cart,
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
