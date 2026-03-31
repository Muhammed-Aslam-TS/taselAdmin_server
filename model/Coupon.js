import { Schema, model } from "mongoose";

const couponSchema = new Schema({
  code: { type: String, required: true, unique: true },
  description: { type: String },
  discount: { type: String },
  expiration: { type: Date },
});

export default model("Coupons", couponSchema);
