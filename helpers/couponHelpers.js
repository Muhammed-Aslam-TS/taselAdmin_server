// helpers/couponHelpers.js
import Coupon from "../model/Coupon.js";

// Get all coupons
export async function fetchAllCoupons() {
  return await Coupon.find();
}

// Create new coupon
export async function createNewCoupon({
  code,
  description,
  discount,
  expiration,
}) {
  const coupon = new Coupon({ code, description, discount, expiration });
  return await coupon.save();
}

// Update a coupon by ID
export async function updateCouponById(id, updateData) {
  return await Coupon.findByIdAndUpdate(id, updateData, { new: true });
}

// Delete a coupon by ID
export async function deleteCouponById(id) {
  return await Coupon.findByIdAndDelete(id);
}
