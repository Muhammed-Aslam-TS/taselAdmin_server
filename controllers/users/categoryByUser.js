import Category from "../../model/categoryModels.js";
// import { storage } from "../../middlewares/fireBase.js";
// import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import User from "../../model/usersModel.js";

// Create a new category

// Get all categories
export const getAllCategories = async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Find the user to get their ownerId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the ownerId from the user
    const ownerId = user.ownerId;

    // Find all categories for this owner
    const categories = await Category.find({ ownerId: ownerId })
      .sort({ createdAt: -1 }); // Sort by newest first      
    if (!categories || categories.length === 0) {
      return res.status(200).json({ 
        message: "No categories found",
        categories: [] 
      });
    }

    res.status(200).json({
      message: "Categories retrieved successfully",
      categories: categories
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ 
      message: "Error fetching categories",
      error: error.message 
    });
  }
};

// Get a single category by ID
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image, description } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.name = name || category.name;
    category.image = image || category.image;
    category.description = description || category.description;

    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
