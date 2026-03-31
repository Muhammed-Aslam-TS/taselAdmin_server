// import mongoose, { Schema, model } from "mongoose";

// //  * Theme Schema
// //  * Stores complete theme customization for each merchant/owner
// //  * Similar to Shopify theme system
// //  */
// const ThemeSchema = new Schema(
//   {
//     ownerId: {
//       type: Schema.Types.ObjectId,
//       ref: 'Owner',
//       required: true,
//       unique: true,
//       index: true
//     },
//     themeName: {
//       type: String,
//       default: 'My Custom Theme',
//       trim: true
//     },
//     isActive: {
//       type: Boolean,
//       default: true
//     },
    
//     // Color Scheme
//     colors: {
//       primary: { type: String, default: '#3B82F6' },
//       secondary: { type: String, default: '#8B5CF6' },
//       accent: { type: String, default: '#10B981' },
//       background: { type: String, default: '#FFFFFF' },
//       surface: { type: String, default: '#F9FAFB' },
//       text: { type: String, default: '#111827' },
//       textSecondary: { type: String, default: '#6B7280' },
//       button: { type: String, default: '#3B82F6' },
//       buttonText: { type: String, default: '#FFFFFF' },
//       buttonHover: { type: String, default: '#2563EB' },
//       header: { type: String, default: '#FFFFFF' },
//       headerText: { type: String, default: '#111827' },
//       footer: { type: String, default: '#1F2937' },
//       footerText: { type: String, default: '#F9FAFB' },
//       border: { type: String, default: '#E5E7EB' },
//       shadow: { type: String, default: 'rgba(0, 0, 0, 0.1)' }
//     },
    
//     // Typography
//     fonts: {
//       headingFont: { type: String, default: 'Inter, sans-serif' },
//       bodyFont: { type: String, default: 'Inter, sans-serif' },
//       fontSize: { type: String, default: '16px' },
//       headingSize: { type: String, default: '2rem' },
//       lineHeight: { type: String, default: '1.6' }
//     },
    
//     // Layout Settings
//     layout: {
//       type: { type: String, enum: ['boxed', 'fullwidth'], default: 'boxed' },
//       containerWidth: { type: String, default: '1280px' },
//       sectionPadding: { type: String, default: '64px' },
//       borderRadius: { type: String, default: '8px' }
//     },
    
//     // Header Customization
//     header: {
//       style: { type: String, enum: ['minimal', 'centered', 'sticky', 'transparent'], default: 'sticky' },
//       logo: { type: String, default: '' },
//       logoSize: { type: String, default: '120px' },
//       height: { type: String, default: '64px' },
//       menuItems: [{ type: String }],
//       showSearch: { type: Boolean, default: true },
//       showCart: { type: Boolean, default: true },
//       showWishlist: { type: Boolean, default: true },
//       showUserMenu: { type: Boolean, default: true }
//     },
    
//     // Footer Customization
//     footer: {
//       style: { type: String, enum: ['simple', 'columns', 'minimal'], default: 'columns' },
//       columns: { type: Number, default: 4 },
//       copyright: { type: String, default: '© 2024 Your Store. All rights reserved.' },
//       socialLinks: {
//         facebook: { type: String, default: '' },
//         twitter: { type: String, default: '' },
//         instagram: { type: String, default: '' },
//         linkedin: { type: String, default: '' }
//       },
//       showNewsletter: { type: Boolean, default: true }
//     },
    
//     // Homepage Sections (Drag-and-drop order)
//     sections: [
//       {
//         id: { type: String, required: true },
//         type: {
//           type: String,
//           enum: [
//             'hero',
//             'featuredProducts',
//             'categories',
//             'offerBanner',
//             'testimonials',
//             'newsletter',
//             'brands',
//             'featuredCollection'
//           ],
//           required: true
//         },
//         order: { type: Number, required: true },
//         enabled: { type: Boolean, default: true },
//         settings: {
//           type: Schema.Types.Mixed,
//           default: {}
//         }
//       }
//     ],
    
//     // Custom CSS (for advanced users)
//     customCSS: { type: String, default: '' }
//   },
//   {
//     timestamps: true,
//     toJSON: { virtuals: true },
//     toObject: { virtuals: true }
//   }
// );

// // Index for faster queries
// ThemeSchema.index({ ownerId: 1, isActive: 1 });

// // Static method to get active theme for owner
// ThemeSchema.statics.getActiveTheme = function(ownerId) {
//   return this.findOne({ ownerId, isActive: true }).exec();
// };

// // Instance method to activate theme
// ThemeSchema.methods.activate = function() {
//   return this.model('Theme').updateMany(
//     { ownerId: this.ownerId },
//     { $set: { isActive: false } }
//   ).then(() => {
//     this.isActive = true;
//     return this.save();
//   });
// };

// const Theme = mongoose.models.Theme || mongoose.model('Theme', ThemeSchema);

// // const Owner = mongoose.models.Owner || mongoose.model("Owner", OwnerSchema);

// export default Theme;




// models/Theme.js
import mongoose from "mongoose";

const SectionSchema = new mongoose.Schema({
  id: { type: String, required: true }, // human-friendly id like "hero-1" or "customComponent-123"
  type: { type: String, required: true },
  model: { type: String }, // support for section variants (hero-split, etc)
  order: { type: Number, default: 1 },
  enabled: { type: Boolean, default: true },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const ThemeSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  themeName: { type: String, default: "Default Theme" },
  colors: { type: mongoose.Schema.Types.Mixed, default: {} },
  fonts: { type: mongoose.Schema.Types.Mixed, default: {} },
  layout: { type: mongoose.Schema.Types.Mixed, default: {} },
  header: { type: mongoose.Schema.Types.Mixed, default: {} },
  footer: { type: mongoose.Schema.Types.Mixed, default: {} },
  sections: { type: [SectionSchema], default: [] }, // backward compat (home page)
  // Per-page dynamic sections for full-site builder
  templates: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      home: [],
      products: [],
      productDetails: [],
      cart: [],
      checkout: [],
      categories: [],
    }
  },
  customCSS: { type: String, default: "" },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  timestamps: false
});

// helper static to get active theme for an owner
ThemeSchema.statics.getActiveTheme = async function(ownerId){
  return this.findOne({ ownerId }).lean();
};

ThemeSchema.pre("save", function(next){
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Theme || mongoose.model("Theme", ThemeSchema);
