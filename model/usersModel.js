// model/userModel.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantId: {
    type: String,
    default: null
  },
  product_name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  inStock: {
    type: Boolean,
    default: true
  },
  isGift: {
    type: Boolean,
    default: false
  },
  bundleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BundleOffer',
    default: null
  }
});

const cartSchema = new mongoose.Schema({
  items: [cartItemSchema],
  couponCode: {
    type: String,
    default: null
  }
}, { _id: false });

const wishlistSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product_name: {
    type: String,
    required: true
  },
  variantId: {
    type: String,
    default: null
  },
  price: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  inStock: {
    type: Boolean,
    default: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

// const wishlistSchema = new mongoose.Schema({
//   items: [wishlistItemSchema],
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now
//   }
// });

const userSchema = new mongoose.Schema({
    username: {
      type: String,
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    mobile: {
      type: Number,
      required: true,
      unique: true,
    },
    cart: {
      type: cartSchema,
      default: () => ({ items: [] })
    },
    wishlist: [wishlistSchema],
    wallet: [],
    isActive: Boolean,
    referralId: String,
    email: {
      type: String,
      required: true,
      unique: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  });
  



const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
