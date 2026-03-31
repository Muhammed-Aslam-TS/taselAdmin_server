import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Banner title is required"],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    type: String,
    required: [true, "Banner image is required"]
  },
  link: {
    type: String,
    trim: true
  },
  position: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: [true, "Owner ID is required"]
  },
  section: {
    type: String,
    enum: ["hero", "category", "product", "offer", "flash_sale"],
    default: "hero"
  }
}, {
  timestamps: true
});

// Index for efficient querying
bannerSchema.index({ ownerId: 1, isActive: 1 });
bannerSchema.index({ position: 1 });

const Banner = mongoose.models.Banner || mongoose.model("Banner", bannerSchema);

export default Banner;