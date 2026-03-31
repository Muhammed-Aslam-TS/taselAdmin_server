import User from "../../model/usersModel.js";
import Offer from "../../model/OfferModel.js";
import Product from "../../model/product.js";

export const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user.id;
    const ownerId = req.owner?._id;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const now = new Date();

    const [user, offer] = await Promise.all([
      User.findById(userId),
      Offer.findOne({
        offerCode: couponCode.toUpperCase(),
        status: "active",
        startDate: { $lte: now },
        endDate: { $gt: now },
        ...(ownerId && { ownerId }),
      }),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    if (!user.cart || user.cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // Clear any existing coupon
    user.cart.couponCode = null;
    user.cart.items.forEach(item => item.discount = 0);

    let totalDiscount = 0;
    const discountValue = offer.discountValue || 0;

    if (offer.scope === 'product' && offer.appliesToProducts?.length > 0) {
      // Apply offer to specific products
      const applicableProductIds = offer.appliesToProducts.map(id => id.toString());
      user.cart.items.forEach(item => {
        if (applicableProductIds.includes(item.productId.toString())) {
          const discountAmount = offer.discountType === 'fixed'
            ? Math.min(discountValue, item.price)
            : (item.price * discountValue) / 100;
          item.discount = discountAmount;
          totalDiscount += discountAmount * item.quantity;
        }
      });
    } else if (offer.scope === 'category' && offer.appliesToCategories?.length > 0) {
      // Apply offer to categories
      const applicableCategoryIds = offer.appliesToCategories.map(id => id.toString());
      const productsInCategories = await Product.find({
        categoryId: { $in: applicableCategoryIds }
      }).select('_id');
      const productIdsInCategories = productsInCategories.map(p => p._id.toString());

      user.cart.items.forEach(item => {
        if (productIdsInCategories.includes(item.productId.toString())) {
          const discountAmount = offer.discountType === 'fixed'
            ? Math.min(discountValue, item.price)
            : (item.price * discountValue) / 100;
          item.discount = discountAmount;
          totalDiscount += discountAmount * item.quantity;
        }
      });
    } else {
      // Apply to all products (scope === 'all')
      user.cart.items.forEach(item => {
        const discountAmount = offer.discountType === 'fixed'
          ? Math.min(discountValue, item.price)
          : (item.price * discountValue) / 100;
        item.discount = discountAmount;
        totalDiscount += discountAmount * item.quantity;
      });
    }

    // Apply max discount cap if set
    if (offer.maxDiscountAmount && totalDiscount > offer.maxDiscountAmount) {
      totalDiscount = offer.maxDiscountAmount;
    }

    user.cart.couponCode = couponCode;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        cart: user.cart,
        totalDiscount,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

