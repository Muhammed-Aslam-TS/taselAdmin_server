import mongoose from 'mongoose';

// const ProductSchema = new mongoose.Schema({
//   // --- SECTION 1: IDENTITY & CATEGORIZATION ---
//   brand: { type: String, required: true, trim: true },
//   title: { type: String, required: true, trim: true },
//   slug: { type: String, unique: true, lowercase: true }, 
//   description: { type: String }, // HTML/Rich Text
//   category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
//   subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' },
//   ownerId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Owner", // Assuming your owner model is named 'Owner'
//       required: true,
//       index: true,
//     },

//   // --- SECTION 2: THE "SIMPLE vs VARIABLE" LOGIC ---
//   // If the product has NO variants (e.g., a bag of rice), use these fields:
//   productType: { 
//     type: String, 
//     enum: ['simple', 'variable'], 
//     default: 'simple' 
//   },
  
//   // Base pricing used for 'simple' products
//   basePrice: {
//     mrp: { type: Number, default: 0 },         // Strikethrough price
//     offerPrice: { type: Number, default: 0 },   // Actual selling price
//     discountPercentage: { type: Number, default: 0 } 
//   },

//   // Base inventory for 'simple' products
//   baseStock: { type: Number, default: 0 },
//   baseSku: { type: String, unique: true, sparse: true, default: undefined },
//  baseShipping: {
//       weight: Number, // kg
//       dimensions: { length: Number, width: Number, height: Number } // cm
//     },
//   // --- SECTION 3: ATTRIBUTES & VARIANTS (Amazon Style) ---
//   // Defines the options (e.g., Color, Size)
//   attributes: [{
//     name: { type: String },   // e.g., "Color"
//     values: [String]          // e.g., ["Black", "Blue"]
//   }],

//   // The actual SKUs for 'variable' products
//   variants: [{
//     sku: { type: String, unique: true, sparse: true, default: undefined },
//     combination: { type: Map, of: String }, // e.g., { "Color": "Black", "Size": "XL" }
//     price: {
//       mrp: { type: Number, required: true },
//       offerPrice: { type: Number, required: true }
//     },
//     stockQuantity: { type: Number, default: 0 },
//     inStock: { type: Boolean, default: true },
//     images: [String], // Color-specific images
//     shipping: {
//       weight: Number, // kg
//       dimensions: { length: Number, width: Number, height: Number } // cm
//     }
//   }],

//   // --- SECTION 4: GLOBAL SPECIFICATIONS ---
//   // Key-value pairs for the "Technical Details" table
//   specifications: [{
//     key: String,
//     value: String
//   }],

//   // --- SECTION 5: MARKETING & VISIBILITY ---
//   flags: {
//     isBlocked: { type: Boolean, default: false },
//     isTrending: { type: Boolean, default: false },
//     isFeatured: { type: Boolean, default: false },
//     isBestSeller: { type: Boolean, default: false },
//     isRecommended: { type: Boolean, default: false },
//     isExclusive: { type: Boolean, default: false },
//     isSpecial: { type: Boolean, default: false },
//     isPopular: { type: Boolean, default: false },
//     isHot: { type: Boolean, default: false },
//     isVerified: { type: Boolean, default: false },
//     isFreeShipping: { type: Boolean, default: false }

//   },

//   // --- SECTION 6: SOCIAL PROOF ---
//   ratings: {
//     average: { type: Number, default: 0 },
//     count: { type: Number, default: 0 }
//   },

//   // --- SECTION 7: COMPLIANCE & SEO ---
//   hsnCode: { type: String }, // GST Compliance
//   taxRate: { type: Number, default: 18 },
//   seo: {
//     metaTitle: String,
//     metaDescription: String,
//     keywords: [String]
//   }

// }, { timestamps: true });

// // --- MIDDLEWARE: AUTO-CALCULATE DISCOUNTS & SLUGS ---
// ProductSchema.pre('save', function(next) {
//   // Generate slug if name changes
//   if (this.isModified('title') && this.title) {
//     this.slug = this.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
//   }

//   // Clean up empty SKUs to ensure sparse index works (prevents E11000 duplicate error on empty strings)
//   if (this.variants && this.variants.length > 0) {
//     this.variants.forEach(variant => {
//       if (!variant.sku) variant.sku = undefined;
//     });
//   }
//   if (!this.baseSku) this.baseSku = undefined;

//   // Calculate discount for Simple Product
//   if (this.productType === 'simple' && this.basePrice.mrp > 0) {
//     this.basePrice.discountPercentage = Math.round(
//       ((this.basePrice.mrp - this.basePrice.offerPrice) / this.basePrice.mrp) * 100
//     );
//   }
//   next();
// });

// // --- INDEXING ---
// ProductSchema.index({ title: 'text', brand: 'text' }); // Fast search
// ProductSchema.index({ category: 1, "flags.isBestSeller": 1 });

// export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
// export default Product;




// server/models/Product.js



const shippingSchema = new mongoose.Schema({
  weight: { type: Number, default: 0 },
  dimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  productType: {
    type: String,
    enum: ['simple', 'variable'],
    default: 'simple'
  },
  description: {
    type: String,
    trim: true
  },
  images: [String],
  
  // Simple Product Specifics (Base fields)
  basePrice: {
    mrp: { type: Number, default: 0 },
    offerPrice: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    shippingCharges: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 }
  },
  baseStock: {
    type: Number,
    default: 0
  },
  baseSku: {
    type: String,
    trim: true
  },
  baseShipping: {
    type: shippingSchema,
    default: () => ({})
  },

  // General Info
  hsnCode: { type: String, trim: true },
  taxRate: { type: Number, default: 0 },
  isTaxInclusive: { type: Boolean, default: true },
  tags: [String],
  videoUrl: { type: String, trim: true },
  features: [String],
  warranty: { type: String, trim: true },
  releaseDate: { type: Date },

  // Variable Product Specifics
  attributes: [{
    name: String,
    values: [String]
  }],
  variants: [{
    sku: String,
    combination: {
      type: Map,
      of: String // e.g., { "Color": "Red", "Size": "M" }
    },
    price: {
      mrp: { type: Number, default: 0 },
      offerPrice: { type: Number, default: 0 }
    },
    stockQuantity: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },
    images: [String], // Variant specific images
    shipping: {
      type: shippingSchema,
      default: () => ({})
    }
  }],

  // SEO & Metadata
  seo: {
    keywords: [String],
    metaTitle: String,
    metaDescription: String
  },

  // Additional Details
  specifications: [{
    key: String,
    value: String
  }],
  
  // Product Flags
  flags: {
    isBlocked: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    isExclusive: { type: Boolean, default: false },
    isSpecial: { type: Boolean, default: false },
    isPopular: { type: Boolean, default: false },
    isHot: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isFreeShipping: { type: Boolean, default: false },
    codBlocked: { type: Boolean, default: false },
    codShippingChargeEnabled: { type: Boolean, default: false },
    codShippingCharge: { type: Number, default: 0 },
    codShippingChargeType: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
    codAdvanceAmountEnabled: { type: Boolean, default: false },
    codAdvanceAmountValue: { type: Number, default: 0 },
    codAdvanceAmountType: { type: String, enum: ['flat', 'percentage'], default: 'flat' }
  },

  // Social Proof metrics
  numberOfReviews: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },

  // System Fields
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Add text index for search functionality
productSchema.index({ title: 'text', brand: 'text', 'seo.keywords': 'text' });
// ProductSchema.index({ title: 'text', brand: 'text' }); // Fast search
productSchema.index({ category: 1, "flags.isBestSeller": 1 });

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;