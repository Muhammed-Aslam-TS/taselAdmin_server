import { createNewCoupon, deleteCouponById, fetchAllCoupons, updateCouponById } from "../../helpers/couponHelpers.js";
import Coupon from "../../model/CouponModel.js";



// GET all coupons
export async function getCoupons(req, res) {
  try {
    const coupons = await fetchAllCoupons();
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST new coupon
export async function createCoupon(req, res) {
  const ownerId = req.user.id;
  
  try {
    const {
      code,
      discountType,
      discountValue,
      minPurchaseAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    // Create new coupon
    const coupon = new Coupon({
      ownerId,
      code,
      discountType,
      discountValue,
      minPurchaseAmount: minPurchaseAmount || 0,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      isActive: true
    });

    await coupon.save();
    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon
    });
  } catch (err) {
    res.status(400).json({ 
      success: false,
      message: err.message 
    });
  }
}

// PUT update coupon
export async function updateCoupon(req, res) {
  try {
    const updatedCoupon = await updateCouponById(req.params.id, req.body);
    res.json(updatedCoupon);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// DELETE coupon
export async function deleteCoupon(req, res) {
  console.log(req.params.id,"__________req.params.id");
  
  try {
    await deleteCouponById(req.params.id);
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}
