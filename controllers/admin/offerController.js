import Offer from "../../model/OfferModel.js";
import Product from "../../model/product.js";

// Create a new offer
export const addOffer = async (req, res) => {
  try {
    const { appliesToCategories, appliesToProducts, endDate, scope, startDate, status } = req.body;
    const ownerId = req.user.id;

    // --- Date Validation ---
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: "End date must be after start date.", success: false });
    }

    // Sync isActive with status
    const isActive = status === 'active';
    req.body.isActive = isActive;
    req.body.ownerId = ownerId;

    // --- Overlapping Offer Check ---
    // If the offer is active, check for date conflicts with other active offers.
    if (isActive) {
      const overlapQuery = {
        endDate: { $gte: new Date(startDate) },
        ownerId,
        startDate: { $lte: new Date(endDate) },
        status: 'active',
      };

      const conflictConditions = [];
      // An offer can always conflict with an existing site-wide offer.
      conflictConditions.push({ ...overlapQuery, scope: 'all' });

      if (scope === 'product' && appliesToProducts?.length) {
        conflictConditions.push({ ...overlapQuery, appliesToProducts: { $in: appliesToProducts }, scope: 'product' });
      } else if (scope === 'category' && appliesToCategories?.length) {
        conflictConditions.push({ ...overlapQuery, appliesToCategories: { $in: appliesToCategories }, scope: 'category' });
      } else if (scope === 'all') {
        conflictConditions.push({ ...overlapQuery }); // A site-wide offer conflicts with any other active offer
      }

      if (conflictConditions.length > 1) { // Check only if there's a specific scope to check against
        const conflictingOffer = await Offer.findOne({ $or: conflictConditions });
        if (conflictingOffer) {
          return res.status(409).json({ message: `This offer overlaps with an existing active offer: "${conflictingOffer.title}".`, success: false });
        }
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
      $or: [
        { scope: 'all' },
        { appliesToProducts: productId, scope: 'product' },
        { 
          appliesToCategories: { 
            // Use [].concat to safely handle single IDs, arrays, or null/undefined
            $in: [].concat(product.categoryId || [])
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
    const startDate = req.body.startDate || existingOffer.startDate;
    const endDate = req.body.endDate || existingOffer.endDate;

    // --- Date Validation ---
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: "End date must be after start date.", success: false });
    }

    const isActive = status === 'active';
    req.body.isActive = isActive;

    // --- Overlapping Offer Check ---
    // Only check for conflicts if the offer is being made active.
    if (isActive) {
      const overlapQuery = {
        ownerId: existingOffer.ownerId,
        _id: { $ne: id }, // Exclude current offer
        status: 'active',
        startDate: { $lte: new Date(endDate) },
        endDate: { $gte: new Date(startDate) },
      };

      const conflictConditions = [];
      // An offer can always conflict with an existing site-wide offer.
      conflictConditions.push({ ...overlapQuery, scope: 'all' });

      if (scope === 'product' && appliesToProducts?.length) {
        conflictConditions.push({ ...overlapQuery, scope: 'product', appliesToProducts: { $in: appliesToProducts } });
      } else if (scope === 'category' && appliesToCategories?.length) {
        conflictConditions.push({ ...overlapQuery, scope: 'category', appliesToCategories: { $in: appliesToCategories } });
      } else if (scope === 'all') {
        conflictConditions.push({ ...overlapQuery }); // A site-wide offer conflicts with any other active offer
      }

      if (conflictConditions.length > 1) { // Check only if there's a specific scope to check against
        const conflictingOffer = await Offer.findOne({ $or: conflictConditions });
        if (conflictingOffer) {
          return res.status(409).json({ message: `This offer overlaps with an existing active offer: "${conflictingOffer.title}".`, success: false });
        }
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

// Get all public, active offers
export const getPublicActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate('appliesToProducts', 'name images price salePrice')
      .populate('appliesToCategories', 'categoryName image')
      .sort({ endDate: 1 }); // Show offers ending soonest first
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};