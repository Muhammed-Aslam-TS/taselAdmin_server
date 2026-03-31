import Offer from "../model/OfferModel.js";
import Product from "../model/product.js";

// Create a new offer
export const addOffer = async (req, res) => {
  try {
    const { appliesToCategories, appliesToProducts, scope, status } = req.body;

    // Sync isActive with status
    const isActive = status === 'active';
    req.body.isActive = isActive;

    // If the new offer is active, deactivate conflicting offers
    if (isActive) {
      const query = { 
        $or: [{ status: 'active' }, { isActive: true }],
        scope
      };

      if (scope === 'product' && appliesToProducts && appliesToProducts.length > 0) {
        query.appliesToProducts = { $in: appliesToProducts };
      } else if (scope === 'category' && appliesToCategories && appliesToCategories.length > 0) {
        query.appliesToCategories = { $in: appliesToCategories };
      }

      // Only proceed if we have a specific target to check against
      if ((scope === 'product' && appliesToProducts?.length) || (scope === 'category' && appliesToCategories?.length)) {
        await Offer.updateMany(query, { 
          $set: { isActive: false, status: 'inactive' } 
        });
      }
    }

    const newOffer = new Offer(req.body);
    const savedOffer = await newOffer.save();

    res.status(201).json(savedOffer);
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

// Check if a product is eligible for any active offers
export const checkProductEligibility = async (req, res) => {
  try {
    const { productId } = req.params;

    // 1. Fetch the product to get its category
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found", success: false });
    }

    const now = new Date();

    // 2. Find active offers that apply to this product OR its category OR site-wide
    const applicableOffers = await Offer.find({
      ownerId: product.ownerId,
      $or: [
        { scope: 'all' },
        { appliesToProducts: productId, scope: 'product' },
        { 
          appliesToCategories: { 
            $in: [product.category]
          },
          scope: 'category' 
        }
      ],
      endDate: { $gte: now },
      startDate: { $lte: now },
      status: 'active'
    }).sort({ discountValue: -1 }); // Prioritize highest discount

    if (applicableOffers.length === 0) {
      return res.status(200).json({ eligible: false, offer: null });
    }

    // Return the best offer found
    return res.status(200).json({ eligible: true, offer: applicableOffers[0] });

  } catch (error) {
    console.error("Error checking product eligibility:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

// Update an existing offer
export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch existing offer to ensure we have all details (scope, IDs) for conflict checking
    // even if the request is a partial update (e.g., just toggling status)
    const existingOffer = await Offer.findById(id);
    if (!existingOffer) {
      return res.status(404).json({ message: "Offer not found", success: false });
    }

    // Merge request body with existing data for logic checks
    const status = req.body.status || existingOffer.status;
    const scope = req.body.scope || existingOffer.scope;
    const appliesToProducts = req.body.appliesToProducts || existingOffer.appliesToProducts;
    const appliesToCategories = req.body.appliesToCategories || existingOffer.appliesToCategories;

    const isActive = status === 'active';
    req.body.isActive = isActive;

    // If setting to active, check for conflicts with OTHER offers
    if (isActive && !existingOffer.isActive) { // Only check if status is CHANGING to active
      const query = { 
        _id: { $ne: id }, // Exclude current offer
        scope,
        $or: [{ status: 'active' }, { isActive: true }]
      };

      if (scope === 'product' && appliesToProducts && appliesToProducts.length > 0) {
        query.appliesToProducts = { $in: appliesToProducts };
      }
      if (scope === 'category' && appliesToCategories && appliesToCategories.length > 0) {
        query.appliesToCategories = { $in: appliesToCategories };
      }

      if ((scope === 'product' && appliesToProducts?.length) || (scope === 'category' && appliesToCategories?.length)) {
        await Offer.updateMany(query, { 
          $set: { isActive: false, status: 'inactive' } 
        });
      }
    }

    const updatedOffer = await Offer.findByIdAndUpdate(id, req.body, { new: true })
      .populate('appliesToProducts', 'name')
      .populate('appliesToCategories', 'categoryName name');
      
    res.status(200).json(updatedOffer);
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

// Get all offers
export const fetchOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate('appliesToProducts', 'name')
      .populate('appliesToCategories', 'categoryName name')
      .sort({ createdAt: -1 });
    res.status(200).json(offers);
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};

// Delete an offer
export const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Offer deleted successfully", success: true });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(500).json({ message: error.message, success: false });
  }
};