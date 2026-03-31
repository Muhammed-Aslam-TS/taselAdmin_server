import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  address: {
    required: true,
    type: String
  },
    city: {
    required: true,
    type: String
  },
  country: {
    default: 'India',
    type: String
  },
  createdAt: {
    default: Date.now,
    type: Date
  },
  firstName: {
        type: String
    },
  isDefault: {
    default: false,
    type: Boolean
  },
  lastName: {
        type: String
    },
  landmark: {
    type: String,
    required: false,
  },
  phone: {
    required: false,
    type: String
  },
   zipCode:{
    required: true,
    type: String
   },
  state: {
    required: true,
    type: String
  },
  type: {
    enum: ['shipping', 'billing'],
    required: true,
    type: String
  },
  updatedAt: {
    default: Date.now,
    type: Date
  },
  userId: {
    ref: 'User',
    required: true,
    type: mongoose.Schema.Types.ObjectId
  }
}, {
  // Enable virtuals to be included in toJSON and toObject outputs
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
addressSchema.virtual('name').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

const Address = mongoose.models.Address || mongoose.model("Address", addressSchema);
export default Address;
