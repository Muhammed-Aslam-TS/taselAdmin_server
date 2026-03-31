import mongoose from "mongoose";

// Check if model exists before creating
const Category = mongoose.models.Category || mongoose.model("Category", new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Category name is required"],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    type: String
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: [true, "Owner ID is required"]
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
}));

// Index for efficient querying
if (!Category.schema.indexes().length) {
  Category.schema.index({ ownerId: 1, name: 1 });
}

export default Category; 