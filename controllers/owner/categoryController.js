import Category from "../../model/categoryModels.js"; // Correct model
import { deleteFromFirebase } from "../../middlewares/base64Convert.js";
import { saveFile } from "../../utils/storageUtils.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";
import { v4 as uuidv4 } from "uuid";
import User from "../../model/usersModel.js";
import Product from "../../model/product.js";

// Create a new category
export const createCategory = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { categoryName } = req.body;
    const imageFile = req.file;

    if (!categoryName || !imageFile) {
      return res
        .status(400)
        .json({ message: "Category name and image are required." });
    }

    // Check for duplicate category
    const existingCategory = await Category.findOne({
      categoryName: categoryName,
      ownerId,
    });
    if (existingCategory) {
      return res.status(409).json({ message: "Category already exists." });
    }

    const buffer = imageFile.buffer;

    // Upload with Fallback (Firebase -> Local)
    const fileName = `${uuidv4()}-${imageFile.originalname}`;
    const downloadURL = await saveFile(buffer, 'categories', fileName);

    // Save new category
    const newCategory = new Category({
      categoryName: categoryName,
      image: downloadURL,
      ownerId,
    });

    const categoryData = await newCategory.save();

    res.status(201).json(categoryData);
  } catch (error) {
    console.error("Category creation error:", error);
    res.status(500).json({ message: error.message });
  }
};
// Get all categories
export const getAllCategories = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ success: false, message: "Store not found for this domain." });
    }

    // Build the query. Owners see all categories, while visitors/users only see active ones.
    const query = { ownerId };
    // Assuming your Category model might have an 'isActive' field like banners.
    if (req.user?.userType !== "owner") {
      // query.isActive = true; // Add this if you have an isActive field in categoryModels.js
    }

    const categories = await Category.find(query);

    res.status(200).json({ success: true, categories: categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    const { categoryName, description } = req.body;
    const imageFile = req.file;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (categoryName) category.categoryName = categoryName;
    if (description) category.description = description;

    // Handle image update (if a new file is uploaded)
    if (imageFile) {
      const buffer = imageFile.buffer;

      // Upload with Fallback (Firebase -> Local)
      const fileName = `${uuidv4()}-${imageFile.originalname}`;
      
      // Delete old image if it exists
      if (category.image) {
        await deleteFromFirebase(category.image);
      }
      category.image = await saveFile(buffer, 'categories', fileName);
    }

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

    // Delete image from Firebase
    if (category.image) {
      await deleteFromFirebase(category.image);
    }

    res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPublicTrendingCategories = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ success: false, message: "Store not found for this domain." });
    }

    // Find all categories for this owner that are marked as trending
    const trendingCategories = await Category.find({ ownerId, isTrending: true });

    if (!trendingCategories || trendingCategories.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No trending categories found for this store.",
      });
    }

    res.status(200).json({ success: true, data: trendingCategories });
  } catch (err) {
    console.error("Error fetching public trending categories:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};