import mongoose, { Schema } from "mongoose";

const AdminSchema = new Schema({

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

export default Admin; 