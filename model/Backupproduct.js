import mongoose from "mongoose";
const { Schema } = mongoose;

// Sub-schema for color variants
const VariantOptionSchema = new Schema(
  {
    value: {
      type: String,
      required: true,
      trim: true,
    }, // e.g., "Red", "128GB", "Large"
    image: {
      type: String, // URL to the variant-specific image
      trim: true,
    },
    priceModifier: { type: Number, default: 0 }, // e.g., +50 for 256GB vs 128GB
    skuSuffix: { type: String, trim: true }, // e.g., "-RD" to append to base SKU
  },
  { _id: false }
);

// Sub-schema for a variant type (e.g., "Color", "Storage")
const VariantTypeSchema = new Schema({
  name: { type: String, required: true, trim: true }, // e.g., "Color", "Storage", "Size"
  options: { type: [VariantOptionSchema], default: [] },
}, { _id: false });

// Sub-schema for key-value pair attributes (used for specifications and custom attributes)
const AttributeSchema = new Schema(
  {
    key: {
      required: true,
      trim: true,
      type: String,
    },
    value: {
      required: true,
      trim: true,
      type: String,
    },
  },
  { _id: false }
);

// Main Product Schema
const ProductSchema = new Schema(
  {
    // Link to the owner who created the product
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "Owner", // Assuming your owner model is named 'Owner'
      required: true,
      index: true,
    },
    addons: [
      {
        ref: "Addon",
        type: mongoose.Schema.Types.ObjectId,
      },
    ],

    // --- Section 1: Product Information ---
    name: {
      required: [true, "Product name is required"],
      trim: true,
      type: String,
    },
    description: {
      type: String, // Rich text content (HTML)
      required: [true, "Product description is required"],
      trim: true,
    },
    categoryId: {
      index: true,
      ref: "Category",
      required: [true, "Category is required"],
      type: [Schema.Types.ObjectId],
    },
    tags: {
      default: [],
      type: [String],
    },

    // --- Section 2: Pricing & Inventory ---
    mrp: {
      default: 0,
      type: Number,
    },
    price: {
      min: [0.01, "Price must be greater than 0"],
      required: [true, "Selling price is required"],
      type: Number,
    },
    discountPercentage: {
      default: 0,
      max: 100,
      min: 0,
      type: Number,
    },
    gst: {
      default: 0,
      required: [true, "GST percentage is required"],
      type: Number,
    },
    sku: {
      required: [true, "SKU is required"],
      trim: true,
      type: String,
      unique: true,
    },
    stock: {
      default: 0,
      required: [true, "Stock quantity is required"],
      type: Number,
    },
    inStock: {
      default: true,
      type: Boolean,
    },
    flags: {
      isBlocked: { type: Boolean, default: false },
      isTrending: { type: Boolean, default: false },
      isFeatured: { type: Boolean, default: false },
      isBestSeller: { type: Boolean, default: false },
      isRecommended: { type: Boolean, default: false },
      isExclusive: { type: Boolean, default: false },
      isSpecial: { type: Boolean, default: false },
      isPopular: { type: Boolean, default: false },
      isHot: { type: Boolean, default: false },
      isVerified: { type: Boolean, default: false },
    },

    // --- New Section: Reviews & Ratings ---
    averageRating: {
      default: 0,
      type: Number,
    },
    numberOfReviews: {
      default: 0,
      type: Number,
    },

    // --- Section 3: Media ---
    images: {
      type: [String], // Array of image URLs
      required: true,
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        "At least one image is required.",
      ],
    },
    videoUrl: {
      trim: true,
      type: String,
    },

    // --- Section 4: SEO ---
    seo: {
      urlSlug: {
        type: String,
        unique: true,
        sparse: true, // Allows multiple documents to have a null value for this field
        trim: true,
      },
      metaTitle: {
        trim: true,
        type: String,
      },
      metaDescription: {
        trim: true,
        type: String,
      },
      keywords: {
        default: [],
        type: [String],
      },
    },

    // --- Section 5: Shipping ---
    shipping: {
      shipping_charge: { default: 0, type: Number }, // in INR
      freeShippingThreshold: { default: 0, type: Number }, // in INR
      weight: { default: 0, type: Number }, // in kg
      dimensions: {
        length: { default: 0, type: Number }, // in cm
        width: { default: 0, type: Number }, // in cm
        height: { default: 0, type: Number }, // in cm
      },
    },

    // --- Section 6: Variants & Options ---
    features: {
      default: [],
      type: [String],
    },
    variants: {
      default: [],
      type: [VariantTypeSchema],
    },

    // --- Section 7: Advanced Details ---
    specifications: {
      default: [],
      type: [AttributeSchema],
    },
    customAttributes: {
      default: [],
      type: [AttributeSchema],
    },
    warranty: {
      trim: true,
      type: String,
    },
    releaseDate: {
      type: Date,
    },
  },
  {
    // Automatically add `createdAt` and `updatedAt` fields
    timestamps: true,
  }
);

// Pre-save hook to generate URL slug from the product name if not provided
ProductSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.seo.urlSlug) {
    this.seo.urlSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // remove special characters
      .replace(/\s+/g, "-") // replace spaces with hyphens
      .slice(0, 100); // limit length
  }
  next();
});

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

export default Product;
