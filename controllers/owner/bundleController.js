import BundleOffer from "../../model/BundleOffer.js";
import { Product } from "../../model/product.js";

// GET /api/bundles
export const getAllBundles = async (req, res) => {
  try {
    const bundles = await BundleOffer.find({ ownerId: req.user.id })
      .populate("applicableProducts", "title images basePrice")
      .populate("applicableCollections", "name")
      .populate("tiers.giftProduct", "title images basePrice");
    res.json(bundles);
  } catch (err) {
    console.error("Error fetching bundles:", err);
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

// GET /api/bundles/:id
export const getBundleById = async (req, res) => {
  try {
    const bundle = await BundleOffer.findOne({ _id: req.params.id, ownerId: req.user.id })
      .populate("applicableProducts", "title images basePrice")
      .populate("applicableCollections", "name")
      .populate("tiers.giftProduct", "title images basePrice");
    
    if (!bundle) {
      return res.status(404).json({ message: "Bundle not found", success: false });
    }
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

// POST /api/bundles/create
export const createBundle = async (req, res) => {
  try {
    const bundleData = { ...req.body, ownerId: req.user.id };
    const newBundle = new BundleOffer(bundleData);
    await newBundle.save();
    res.status(201).json({ data: newBundle, message: "Bundle created successfully", success: true });
  } catch (err) {
    console.error("Error creating bundle:", err);
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

// PUT /api/bundles/:id
export const updateBundle = async (req, res) => {
  try {
    const bundle = await BundleOffer.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      req.body,
      { new: true }
    );
    if (!bundle) {
      return res.status(404).json({ message: "Bundle not found", success: false });
    }
    res.json({ data: bundle, message: "Bundle updated successfully", success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

// DELETE /api/bundles/:id
export const deleteBundle = async (req, res) => {
  try {
    const bundle = await BundleOffer.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!bundle) {
      return res.status(404).json({ message: "Bundle not found", success: false });
    }
    res.json({ message: "Bundle deleted successfully", success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

// GET /api/product/:productId/bundle (Public or Private depending on how it's called)
// For now, let's make it easy to fetch for the storefront
export const getBundleForProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find active bundles that apply to this product
    // Logic:
    // 1. All products bundle
    // 2. Specific products bundle (if product ID in applicableProducts)
    // 3. All collections bundle
    // 4. Specific collections bundle (if product category in applicableCollections)
    
    const now = new Date();
    const query = {
      ownerId: product.ownerId,
      status: 'active',
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gt: now } }
      ],
      $or: [
        { triggerType: 'all_products' },
        { 
          triggerType: 'specific_products', 
          applicableProducts: productId 
        },
        { triggerType: 'all_collections' },
        { 
          triggerType: 'specific_collections', 
          applicableCollections: product.category 
        }
      ]
    };

    // Sort by priority or just take the most recent?
    // User didn't specify priority, so let's find the most specific first
    const bundles = await BundleOffer.find(query)
      .populate("tiers.giftProduct", "title images basePrice")
      .sort({ createdAt: -1 });

    res.json(bundles[0] || null); // Return the most recent matching bundle
  } catch (err) {
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

export const getAllPublicBundles = async (req, res) => {
  try {
    const now = new Date();
    const bundles = await BundleOffer.find({
      status: 'active',
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gt: now } }
      ]
    })
    .populate("applicableProducts", "title images basePrice")
    .populate("applicableCollections", "name")
    .sort({ createdAt: -1 });

    res.json({ success: true, data: bundles });
  } catch (err) {
    console.error("Error fetching public bundles:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
