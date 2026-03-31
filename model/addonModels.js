import mongoose from "mongoose";
const { Schema } = mongoose;

const addonSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Addon name is required."],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Addon price is required."],
      default: 0,
      min: [0, "Price cannot be negative."],
    },
    description: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Addon = mongoose.models.Addon || mongoose.model("Addon", addonSchema);

export default Addon;