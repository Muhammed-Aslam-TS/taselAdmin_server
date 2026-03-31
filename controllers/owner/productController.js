import { processBase64Image, deleteFromFirebase } from "../../middlewares/base64Convert.js";
import { saveFile } from "../../utils/storageUtils.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";
import Category from "../../model/categoryModels.js";

import Review from "../../model/reviewModel.js";
import Offer from "../../model/OfferModel.js";
import Addon from "../../model/addonModels.js";

import { v4 as uuidv4 } from "uuid";
import { Product } from "../../model/product.js";
import sharp from "sharp";

const parseArrayField = (data) => {
  if (!data) return [];
  
  // If data is already an array, map over it to parse items if they are JSON strings
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === "string") {
        try {
          return JSON.parse(item);
        } catch (e) {
          return item;
        }
      }
      return item;
    });
  }
  
  // If data is a string, try to parse it (could be stringified array or object)
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      // If parsing fails, treat as a single item in an array
      return [data];
    }
  }
  return [data];
};

const safeJSONParse = (data, defaultValue) => {
  try {
    return JSON.parse(data || JSON.stringify(defaultValue));
  } catch {
    return defaultValue;
  }
};

const compressImage = async (buffer) => {
  try {
    return await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .toFormat('webp', { quality: 80 })
      .toBuffer();
  } catch (error) {
    console.warn("Image compression failed, using original:", error.message);
    return buffer;
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({ ownerId: req.user.id }).populate(
      "category",
      "categoryName"
    );

    // console.log(`[ProductController] Fetched ${products.length} products`);
    
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: err.message, message: "Server error" });
  }
};

export const createProduct = async (req, res) => {
  try {
    // --- Section 1: Destructure and Log ---
    const {
      brand,
      name,
      title,
      description,
      categoryId,
      category,
      subCategory,
      tags,
      mrp,
      price,
      discountPercentage,
      gst,
      sku,
      stock,
      images,
      videoUrl,
      seo,
      shipping,
      features,
      attributes,
      variants,
      specifications,
      productType,
      hsnCode,
      warranty,
      releaseDate,
      addons,
      flags,
      basePrice,
      baseStock,
      isActive,
      isDeleted,
      taxRate,
      isTaxInclusive,
      shippingCharges
    } = req.body;

    // Use upload.any() and filter for image files, as the client might send indexed field names (e.g., images[0]).
    const allFiles = req.files || [];
    const primaryImages = allFiles.filter(
      (file) => file.fieldname.startsWith("images")
    );
    const variantImageFiles = allFiles.filter((file) => 
      file.fieldname.startsWith("variant_images_") || 
      /^variants\[\d+\]\[images\]/.test(file.fieldname)
    );
    const otherFiles = allFiles.filter((file) => 
      !file.fieldname.startsWith("images") && 
      !file.fieldname.startsWith("variant_images_") &&
      !/^variants\[\d+\]\[images\]/.test(file.fieldname)
    );

    console.log(`[ProductController] Creating new product: ${title || name}`);
    console.log("Request Body:", req.body);
    console.log("Primary Image Files:", primaryImages);
    if (otherFiles.length > 0) {
      console.log(
        "Warning: Received other unexpected files:",
        otherFiles.map((f) => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
        }))
      );
    }

    // Parse basePrice if it exists and is a string
    const parsedBasePrice = typeof basePrice === 'string' ? safeJSONParse(basePrice, {}) : basePrice || {};
    const effectivePrice = price !== undefined ? price : parsedBasePrice.offerPrice;

    // --- Section 2: Validation ---
    const requiredFields = {
      brand,
      title: title || name,
      description,
      category: category || categoryId,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (
        !value ||
        (field === "category" && Array.isArray(value) && value.length === 0)
      ) {
        return res.status(400).json({
          message: `Missing or empty required field: ${field}`,
          success: false,
        });
      }
    }

    // Validate price for simple products
    if ((!productType || productType === 'simple') && !effectivePrice) {
      return res.status(400).json({
        message: "Missing or empty required field: price",
        success: false,
      });
    }

    // --- Section 3: Data Parsing and Processing ---
    const ownerId = req.user.id;

    // Validate Addons
    const parsedAddons = parseArrayField(addons);
    if (parsedAddons.length > 0) {
      const validAddonsCount = await Addon.countDocuments({
        _id: { $in: parsedAddons },
        ownerId,
      });
      if (validAddonsCount !== parsedAddons.length) {
        return res.status(400).json({
          message: "One or more invalid addon IDs provided.",
          success: false,
        });
      }
    }

    // 1. Prepare Primary Images Upload (Files)
    const primaryImageUploadPromise = (primaryImages && primaryImages.length > 0)
      ? Promise.all(primaryImages.map(async (file) => {
          const compressedBuffer = await compressImage(file.buffer);
          const extension = compressedBuffer !== file.buffer ? 'webp' : (file.originalname.split('.').pop() || 'jpg');
          const fileName = `${uuidv4()}-${file.originalname.replace(/\.[^/.]+$/, "")}.${extension}`;
          // This will try Firebase first, then fallback to Local
          return await saveFile(compressedBuffer, 'images', fileName);
        }))
      : Promise.resolve([]);

    // 2. Prepare Primary Images Processing (Body/Base64)
    const parsedBodyImages = parseArrayField(images);
    const bodyImageProcessingPromise = (parsedBodyImages.length > 0)
      ? Promise.all(parsedBodyImages.map(async (img) => {
          if (typeof img === "string" && !img.startsWith("http")) {
            return await processBase64Image(img);
          }
          return img;
        }))
      : Promise.resolve([]);

    // Group variant image files by their index from the fieldname (e.g., variant_images_0)
    const variantImageMap = new Map();
    for (const file of variantImageFiles) {
      let match = file.fieldname.match(/variant_images_(\d+)/);
      if (!match) {
        match = file.fieldname.match(/^variants\[(\d+)\]\[images\]/);
      }
      if (match && match[1]) {
        const index = parseInt(match[1], 10);
        if (!variantImageMap.has(index)) {
          variantImageMap.set(index, []);
        }
        variantImageMap.get(index).push(file);
      }
    }

    // Handle Variants (Amazon Style)
    let parsedVariants = parseArrayField(variants);
    
    // Deduplicate Variant SKUs to avoid E11000 errors
    const seenVariantSkus = new Set();
    parsedVariants = parsedVariants.map((v) => {
      let variantSku = v.sku;
      // If SKU is missing or duplicate, generate a new unique one
      if (!variantSku || seenVariantSkus.has(variantSku)) {
        variantSku = `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
      seenVariantSkus.add(variantSku);
      return { ...v, sku: variantSku };
    });

    // 3. Prepare Variant Processing
    const variantProcessingPromise = Promise.all(
      parsedVariants.map(async (variant, index) => {
        // Handle images inside variants (from base64 strings)
        let variantImagesPromise = Promise.resolve([]);
        if (Array.isArray(variant.images)) {
          variantImagesPromise = Promise.all(variant.images.map(async (img) => {
            if (typeof img === "string" && !img.startsWith("http")) {
              return await processBase64Image(img);
            }
            if (typeof img === 'object' && (!img || Object.keys(img).length === 0)) return null;
            return img;
          }));
        }

        // Handle uploaded files for this specific variant index
        const filesForThisVariant = variantImageMap.get(index) || [];
        let variantFileUploadsPromise = Promise.resolve([]);
        if (filesForThisVariant.length > 0) {
          variantFileUploadsPromise = Promise.all(filesForThisVariant.map(async (file) => {
            const compressedBuffer = await compressImage(file.buffer);
            const extension = compressedBuffer !== file.buffer ? 'webp' : (file.originalname.split('.').pop() || 'jpg');
            const fileName = `${uuidv4()}-${file.originalname.replace(/\.[^/.]+$/, "")}.${extension}`;
            return await saveFile(compressedBuffer, 'images', fileName);
          }));
        }

        const [processedVariantImages, uploadedVariantFiles] = await Promise.all([
          variantImagesPromise,
          variantFileUploadsPromise
        ]);

        const stockQty = Number(variant.stockQuantity) || 0;
        
        return {
          ...variant,
          inStock: variant.inStock !== undefined ? (variant.inStock === true || variant.inStock === "true") : stockQty > 0,
          images: [...processedVariantImages, ...uploadedVariantFiles].filter(Boolean),
          // Ensure combination is a Map or Object
          combination: variant.combination || {}
        };
      })
    );

    // Execute all in parallel
    const [uploadedPrimaryUrls, processedBodyUrls, processedVariants] = await Promise.all([
      primaryImageUploadPromise,
      bodyImageProcessingPromise,
      variantProcessingPromise
    ]);

    const imageUrls = [...uploadedPrimaryUrls.filter(Boolean), ...processedBodyUrls.filter(Boolean)];

    const parsedFlags = typeof flags === "string" ? safeJSONParse(flags, {}) : flags || {};

    let finalBaseStock = 0;
    if (baseStock !== undefined && baseStock !== null && baseStock !== "") {
      finalBaseStock = Number(baseStock);
    } else if (stock !== undefined && stock !== null && stock !== "") {
      finalBaseStock = Number(stock);
    }
    if (isNaN(finalBaseStock)) finalBaseStock = 0;

    if (finalBaseStock < 0) {
      return res.status(400).json({ message: "Stock cannot be negative", success: false });
    }

    // Ensure baseSku is unique and present
    const finalBaseSku = (sku && sku.trim().length > 0) 
      ? sku 
      : `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // --- Section 4: Product Instance Creation ---

    // Calculate GST Amount based on inclusivity
    const tr = Number(taxRate) || 0;
    const op = Number(effectivePrice) || 0;
    const isInc = isTaxInclusive === true || isTaxInclusive === "true";
    let calculatedGst = 0;
    if (tr > 0 && op > 0) {
      if (isInc) {
        calculatedGst = op - (op / (1 + tr / 100));
      } else {
        calculatedGst = op * (tr / 100);
      }
    }

    const newProduct = new Product({
      ownerId,
      brand: brand || "Generic",
      title: title || name,
      description,
      category: category || (Array.isArray(categoryId) ? categoryId[0] : categoryId),
      subCategory: (subCategory && subCategory !== "undefined" && subCategory !== "null") ? subCategory : null,
      productType: productType || (processedVariants.length > 0 ? 'variable' : 'simple'),
      
      // Base Price & Stock (for simple products)
      basePrice: {
        mrp: Number(mrp) || Number(parsedBasePrice.mrp) || Number(effectivePrice) || 0,
        offerPrice: Number(effectivePrice) || 0,
        discountPercentage: Number(discountPercentage) || (mrp && effectivePrice ? Math.round(((Number(mrp) - Number(effectivePrice)) / Number(mrp)) * 100) : 0),
        shippingCharges: Number(shippingCharges) || 0,
        gstAmount: Math.round(calculatedGst * 100) / 100,
      },
      baseStock: finalBaseStock,
      baseSku: finalBaseSku,
      
      hsnCode,
      taxRate: Number(taxRate) || Number(gst) || 18,
      
      tags: parseArrayField(tags),
      images: imageUrls,
      videoUrl: videoUrl || "",
      seo: typeof seo === "string" ? safeJSONParse(seo, {}) : seo || {},
      baseShipping:
        typeof shipping === "string" ? safeJSONParse(shipping, {}) : shipping || {},
      features: parseArrayField(features),
      
      attributes: parseArrayField(attributes),
      variants: processedVariants,
      specifications: parseArrayField(specifications),
      warranty: warranty || "",
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      addons: parsedAddons,
      // Boolean flags
      flags: {
        isBlocked: parsedFlags.isBlocked === true || parsedFlags.isBlocked === "true",
        isTrending: parsedFlags.isTrending === true || parsedFlags.isTrending === "true",
        isFeatured: parsedFlags.isFeatured === true || parsedFlags.isFeatured === "true",
        isBestSeller: parsedFlags.isBestSeller === true || parsedFlags.isBestSeller === "true",
        isRecommended: parsedFlags.isRecommended === true || parsedFlags.isRecommended === "true",
        isExclusive: parsedFlags.isExclusive === true || parsedFlags.isExclusive === "true",
        isSpecial: parsedFlags.isSpecial === true || parsedFlags.isSpecial === "true",
        isPopular: parsedFlags.isPopular === true || parsedFlags.isPopular === "true",
        isHot: parsedFlags.isHot === true || parsedFlags.isHot === "true",
        isVerified: parsedFlags.isVerified === true || parsedFlags.isVerified === "true",
        isFreeShipping: parsedFlags.isFreeShipping === true || parsedFlags.isFreeShipping === "true",
        codBlocked: parsedFlags.codBlocked === true || parsedFlags.codBlocked === "true",
        codShippingCharge: Number(parsedFlags.codShippingCharge) || 0
      },
      isActive: isActive !== undefined ? (isActive === true || isActive === "true") : true,
      isDeleted: isDeleted !== undefined ? (isDeleted === true || isDeleted === "true") : false,
      taxRate: Number(taxRate) || 0,
      isTaxInclusive: isTaxInclusive !== undefined ? (isTaxInclusive === true || isTaxInclusive === "true") : true,
    });

    // --- Section 5: Save and Respond ---
    try {
      await newProduct.save();
    } catch (saveError) {
      // Auto-fix for legacy index issue: duplicate key on { sku: null } or { slug: null }
      // This detects if the error is caused by the old 'sku_1' or 'slug_1' index
      if (saveError.code === 11000 && 
          (saveError.keyPattern?.sku || saveError.message?.includes("sku_1") || 
           saveError.keyPattern?.slug || saveError.message?.includes("slug_1"))) {
        
        const indexToDrop = (saveError.keyPattern?.sku || saveError.message?.includes("sku_1")) ? "sku_1" : "slug_1";
        console.warn(`[ProductController] Legacy '${indexToDrop}' index detected. Dropping index...`);
        try {
          await Product.collection.dropIndex(indexToDrop);
          console.log(`[ProductController] Legacy index '${indexToDrop}' dropped. Retrying save...`);
          await newProduct.save();
        } catch (dropError) {
          console.error(`[ProductController] Failed to drop legacy index '${indexToDrop}':`, dropError);
          throw saveError; // Throw original error if drop fails
        }
      } else {
        throw saveError;
      }
    }

    console.log(`[ProductController] Product created successfully with ID: ${newProduct._id}`);
    res.status(201).json({
      data: newProduct,
      message: "Product created successfully",
      success: true,
    });
  } catch (error) {
    console.error(`[ProductController] Error creating product:`, error);
    // Provide more specific error messages if possible (e.g., validation errors)
    if (error.name === "ValidationError") {
      return res.status(400).json({
        errors: error.errors,
        message: "Validation failed",
        success: false,
      });
    }
    res.status(500).json({
      error: error.message,
      message: "Error creating product",
      success: false,
    });
  }
};

export const softDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    // Fetch product first to get image URLs
    const product = await Product.findOne({ _id: id, ownerId });

    if (!product) {
      return res.status(404).json({
        message: "Product not found or you don't have permission to modify it",
        success: false,
      });
    }

    // Delete primary images from Firebase
    if (product.images && Array.isArray(product.images)) {
      await Promise.all(product.images.map(url => deleteFromFirebase(url)));
    }

    // Delete variant images from Firebase
    if (product.variants && Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        if (variant.images && Array.isArray(variant.images)) {
          await Promise.all(variant.images.map(url => deleteFromFirebase(url)));
        }
      }
    }

    // Mark as blocked and clear image arrays
    product.flags.isBlocked = true;
    product.images = [];
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach(v => {
        v.images = [];
      });
    }

    await product.save();

    res.status(200).json({
      data: product,
      message: "Product has been soft deleted (blocked) and images removed from storage",
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      message: "Error soft deleting product",
      success: false,
    });
  }
};

export const hardDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const deletedProduct = await Product.findOneAndDelete({ _id: id, ownerId });

    if (!deletedProduct) {
      return res.status(404).json({
        message: "Product not found or you don't have permission to delete it",
        success: false,
      });
    }

    // Delete images from Firebase
    if (deletedProduct.images && Array.isArray(deletedProduct.images)) {
      await Promise.all(deletedProduct.images.map(url => deleteFromFirebase(url)));
    }

    // Delete variant images from Firebase
    if (deletedProduct.variants && Array.isArray(deletedProduct.variants)) {
      for (const variant of deletedProduct.variants) {
        if (variant.images && Array.isArray(variant.images)) {
          await Promise.all(variant.images.map(url => deleteFromFirebase(url)));
        }
      }
    }

    res
      .status(200)
      .json({ message: "Product permanently deleted and images cleared", success: true });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      message: "Error deleting product",
      success: false,
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    console.log(`[ProductController] Updating product ID: ${id} for Owner: ${ownerId}`);

    // --- Section 1: Fetch Existing Product ---
    const product = await Product.findOne({ _id: id, ownerId });
    if (!product) {
      return res.status(404).json({
        message: "Product not found or you don't have permission to update it",
        success: false,
      });
    }

    // --- Section 2: Destructure Request Body & Files ---
    const {
      brand,
      name,
      title,
      description,
      categoryId,
      category,
      subCategory,
      tags,
      mrp,
      price,
      discountPercentage,
      gst,
      sku,
      stock,
      images, // This will now be a list of existing image URLs to keep
      videoUrl,
      seo,
      shipping,
      features,
      attributes,
      variants,
      specifications,
      productType,
      hsnCode,
      warranty,
      releaseDate,
      baseStock,
      basePrice,
      addons,
      flags,
      inStock,
      isActive,
      isDeleted,
      taxRate,
      isTaxInclusive,
      shippingCharges,
    } = req.body;

     // console.log(`[ProductController] Update request files received`);

    // Use upload.any() and filter for image files.
    const allFiles = req.files || [];
    const newImageFiles = allFiles.filter(
      (file) => file.fieldname.startsWith("images")
    );
    const newVariantImageFiles = allFiles.filter((file) =>
      file.fieldname.startsWith("variant_images_") ||
      /^variants\[\d+\]\[images\]/.test(file.fieldname)
    );

    // --- Section 3: Prepare Update Payload ---
    const updateFields = {};

    // Direct field updates
    if (brand !== undefined) updateFields.brand = brand;
    if (title !== undefined || name !== undefined) updateFields.title = title || name;
    if (description !== undefined) updateFields.description = description;
    
    // Handle Category (Single ID now)
    const catId = category || categoryId;
    if (catId !== undefined) {
      updateFields.category = Array.isArray(catId) ? catId[0] : catId;
    }
    if (subCategory !== undefined) {
      updateFields.subCategory = (subCategory && subCategory !== "undefined" && subCategory !== "null") ? subCategory : null;
    }

    if (productType !== undefined) updateFields.productType = productType;
    if (hsnCode !== undefined) updateFields.hsnCode = hsnCode;
    if (taxRate !== undefined || gst !== undefined) updateFields.taxRate = Number(taxRate || gst);

    // Base Stock Updates
    if (sku !== undefined) updateFields.baseSku = sku;
    if (baseStock !== undefined || stock !== undefined) {
      const val = Number(baseStock || stock);
      if (val < 0) return res.status(400).json({ message: "Stock cannot be negative", success: false });
      updateFields.baseStock = val;
    }

    if (videoUrl !== undefined) updateFields.videoUrl = videoUrl;
    if (warranty !== undefined) updateFields.warranty = warranty;
    if (releaseDate !== undefined) {
      const parsedDate = new Date(releaseDate);
      updateFields.releaseDate = releaseDate && !isNaN(parsedDate) ? parsedDate : null;
    }

    // Boolean fields (Flags)
    if (flags !== undefined) {
      const parsedFlags = typeof flags === "string" ? safeJSONParse(flags, {}) : flags;
      const flagsToCheck = [
        "isBlocked", "isTrending", "isFeatured", "isBestSeller", 
        "isRecommended", "isExclusive", "isSpecial", "isPopular", 
        "isHot", "isVerified", "isFreeShipping",
        "codBlocked" 
      ];
      flagsToCheck.forEach(flag => {
        if (parsedFlags[flag] !== undefined) {
          updateFields[`flags.${flag}`] = parsedFlags[flag] === true || parsedFlags[flag] === "true";
        }
      });
      // Handle codShippingCharge separately as it is a number
      if (parsedFlags.codShippingCharge !== undefined) {
        updateFields['flags.codShippingCharge'] = Number(parsedFlags.codShippingCharge) || 0;
      }
    }

    if (inStock !== undefined) updateFields.inStock = inStock === true || inStock === "true";
    if (isActive !== undefined) updateFields.isActive = isActive === true || isActive === "true";
    if (isDeleted !== undefined) updateFields.isDeleted = isDeleted === true || isDeleted === "true";
    
    // Tax Rate & Inclusivity (for general info)
    if (taxRate !== undefined) updateFields.taxRate = Number(taxRate) || 0;
    if (isTaxInclusive !== undefined) updateFields.isTaxInclusive = isTaxInclusive === true || isTaxInclusive === "true";

    // Handle price updates and recalculate GST (using dot notation for basePrice sub-fields)
    if (mrp !== undefined || price !== undefined || discountPercentage !== undefined || taxRate !== undefined || isTaxInclusive !== undefined || shippingCharges !== undefined || basePrice !== undefined) {
      const currentProduct = await Product.findById(id);
      if (currentProduct) {
        const tr = taxRate !== undefined ? (Number(taxRate) || 0) : (currentProduct.taxRate || 0);
        const isInc = isTaxInclusive !== undefined ? (isTaxInclusive === true || isTaxInclusive === "true") : (currentProduct.isTaxInclusive !== false);
        
        let op = 0;
        if (price !== undefined) op = Number(price);
        else if (basePrice && typeof basePrice === 'object' && basePrice.offerPrice !== undefined) op = Number(basePrice.offerPrice);
        else op = currentProduct.basePrice?.offerPrice || 0;

        const sc = shippingCharges !== undefined ? (Number(shippingCharges) || 0) : (currentProduct.basePrice?.shippingCharges || 0);
        
        let calculatedGst = 0;
        if (tr > 0 && op > 0) {
          if (isInc) {
            calculatedGst = op - (op / (1 + tr / 100));
          } else {
            calculatedGst = op * (tr / 100);
          }
        }

        if (mrp !== undefined) updateFields['basePrice.mrp'] = Number(mrp);
        if (price !== undefined) updateFields['basePrice.offerPrice'] = Number(price);
        if (discountPercentage !== undefined) updateFields['basePrice.discountPercentage'] = Number(discountPercentage);
        
        // Specific handle for basePrice object if passed
        if (basePrice && typeof basePrice === 'object') {
          if (basePrice.mrp !== undefined) updateFields['basePrice.mrp'] = Number(basePrice.mrp);
          if (basePrice.offerPrice !== undefined) updateFields['basePrice.offerPrice'] = Number(basePrice.offerPrice);
          if (basePrice.discountPercentage !== undefined) updateFields['basePrice.discountPercentage'] = Number(basePrice.discountPercentage);
        }

        const finalMrp = updateFields['basePrice.mrp'] || currentProduct.basePrice?.mrp || 0;
        const finalPrice = updateFields['basePrice.offerPrice'] || currentProduct.basePrice?.offerPrice || 0;
        if (finalMrp > 0 && finalPrice > 0 && (discountPercentage === undefined && (!basePrice || basePrice.discountPercentage === undefined))) {
          updateFields['basePrice.discountPercentage'] = Math.round(((finalMrp - finalPrice) / finalMrp) * 100);
        }

        updateFields['basePrice.shippingCharges'] = sc;
        updateFields['basePrice.gstAmount'] = Math.round(calculatedGst * 100) / 100;
      }
    }

    // Parsed fields
    if (addons !== undefined) {
      const parsedAddons = parseArrayField(addons);
      if (parsedAddons.length > 0) {
        const validAddonsCount = await Addon.countDocuments({
          _id: { $in: parsedAddons },
          ownerId,
        });
        if (validAddonsCount !== parsedAddons.length) {
          return res.status(400).json({
            message: "One or more invalid addon IDs provided.",
            success: false,
          });
        }
      }
      updateFields.addons = parsedAddons;
    }
    if (tags !== undefined) updateFields.tags = parseArrayField(tags);
    if (features !== undefined) updateFields.features = parseArrayField(features);
    if (attributes !== undefined) updateFields.attributes = parseArrayField(attributes);
    if (specifications !== undefined) updateFields.specifications = parseArrayField(specifications);

    // Handle partial updates for nested SEO object using dot notation
    if (seo !== undefined) {
      const seoUpdates = typeof seo === "string" ? safeJSONParse(seo, {}) : seo;
      for (const key in seoUpdates) {
        if (Object.prototype.hasOwnProperty.call(seoUpdates, key)) {
          updateFields[`seo.${key}`] = seoUpdates[key];
        }
      }
    }

    // Handle partial updates for nested Shipping object using dot notation
    if (shipping !== undefined) {
      const shippingUpdates =
        typeof shipping === "string" ? safeJSONParse(shipping, {}) : shipping;
      for (const key in shippingUpdates) {
        if (Object.prototype.hasOwnProperty.call(shippingUpdates, key)) {
          // Handle the doubly nested 'dimensions' object
          if (key === "dimensions" && typeof shippingUpdates[key] === "object" && shippingUpdates[key] !== null) {
            for (const dimKey in shippingUpdates[key]) {
              if (Object.prototype.hasOwnProperty.call(shippingUpdates[key], dimKey)) {
                updateFields[`baseShipping.dimensions.${dimKey}`] = shippingUpdates[key][dimKey];
              }
            }
          } else {
            updateFields[`baseShipping.${key}`] = shippingUpdates[key];
          }
        }
      }
    }
    // --- Section 4: Process Images and Variants ---
    // Group new variant image files by their index
    const newVariantImageMap = new Map();
    for (const file of newVariantImageFiles) {
      let match = file.fieldname.match(/variant_images_(\d+)/);
      if (!match) {
        match = file.fieldname.match(/^variants\[(\d+)\]\[images\]/);
      }
      if (match && match[1]) {
        const index = parseInt(match[1], 10);
        if (!newVariantImageMap.has(index)) {
          newVariantImageMap.set(index, []);
        }
        newVariantImageMap.get(index).push(file);
      }
    }

    // 1. Prepare New Primary Images Upload
    const newImageUploadPromise = (newImageFiles && newImageFiles.length > 0)
      ? Promise.all(newImageFiles.map(async (file) => {
          const compressedBuffer = await compressImage(file.buffer);
          const extension = compressedBuffer !== file.buffer ? 'webp' : (file.originalname.split('.').pop() || 'jpg');
          const fileName = `${uuidv4()}-${file.originalname.replace(/\.[^/.]+$/, "")}.${extension}`;
          // This will try R2 -> Firebase -> Local
          return await saveFile(compressedBuffer, 'images', fileName);
        }))
      : Promise.resolve([]);

    // 2. Prepare Body Images Processing
    let bodyImageProcessingPromise = Promise.resolve([]);
    if (images !== undefined) {
      const parsedBodyImages = parseArrayField(images);
      if (parsedBodyImages.length > 0) {
        bodyImageProcessingPromise = Promise.all(
          parsedBodyImages.map(async (img) => {
            if (typeof img === "string" && !img.startsWith("http")) {
              return await processBase64Image(img);
            }
            return img;
          })
        );
      }
    }

    // 3. Prepare Variant Processing
    let variantProcessingPromise = Promise.resolve(undefined);
    if (variants !== undefined) {
      let parsedVariants = parseArrayField(variants);
      variantProcessingPromise = Promise.all(
        parsedVariants.map(async (variant, index) => {
          // Handle images inside variants (base64 or existing URLs)
          let variantImagesPromise = Promise.resolve([]);
          if (Array.isArray(variant.images)) {
            variantImagesPromise = Promise.all(variant.images.map(async (img) => {
              if (typeof img === "string" && !img.startsWith("http")) {
                return await processBase64Image(img);
              }
              if (typeof img === 'object' && (!img || Object.keys(img).length === 0)) return null;
              return img;
            }));
          }

          // Handle newly uploaded files for this variant
          const filesForThisVariant = newVariantImageMap.get(index) || [];
          let variantFileUploadsPromise = Promise.resolve([]);
          if (filesForThisVariant.length > 0) {
            variantFileUploadsPromise = Promise.all(filesForThisVariant.map(async (file) => {
                const compressedBuffer = await compressImage(file.buffer);
                const extension = compressedBuffer !== file.buffer ? 'webp' : (file.originalname.split('.').pop() || 'jpg');
                const fileName = `${uuidv4()}-${file.originalname.replace(/\.[^/.]+$/, "")}.${extension}`;
                // This will try Firebase first, then fallback to Local
                return await saveFile(compressedBuffer, 'images', fileName);
            }));
          }

          const [processedVariantImages, uploadedVariantFiles] = await Promise.all([
            variantImagesPromise,
            variantFileUploadsPromise
          ]);

          const stockQty = Number(variant.stockQuantity) || 0;

          return {
            ...variant,
            inStock: variant.inStock !== undefined ? (variant.inStock === true || variant.inStock === "true") : stockQty > 0,
            images: [...processedVariantImages, ...uploadedVariantFiles].filter(Boolean),
            combination: variant.combination || {},
          };
        })
      );
    }

    // Execute all in parallel
    const [uploadedNewUrls, processedBodyUrls, processedVariants] = await Promise.all([
      newImageUploadPromise,
      bodyImageProcessingPromise,
      variantProcessingPromise
    ]);

    // Construct final image list
    let finalImageUrls = [];
    if (images !== undefined) {
      finalImageUrls.push(...processedBodyUrls.filter(Boolean));
    }
    finalImageUrls.push(...uploadedNewUrls);

    if (images !== undefined || (newImageFiles && newImageFiles.length > 0)) {
      updateFields.images = finalImageUrls;
    }

    if (processedVariants !== undefined) {
      updateFields.variants = processedVariants;
    }

    // --- Section 4.5: Delete Orphaned Images from Firebase ---
    try {
      // 1. Handle primary images
      if (updateFields.images) {
        const oldImages = product.images || [];
        const newImages = updateFields.images;
        const imagesToDelete = oldImages.filter(img => !newImages.includes(img));
        await Promise.all(imagesToDelete.map(url => deleteFromFirebase(url)));
      }

      // 2. Handle variant images
      if (updateFields.variants) {
        const oldVariants = product.variants || [];
        const newVariants = updateFields.variants;
        
        // This is simplified: it's hard to track exactly which variant image changed if variants are replaced
        // We can at least delete images from old variants that are completely gone
        // Or better, track all new variant images and delete any old variant image that isn't in the new list
        const allNewVariantImages = newVariants.reduce((acc, v) => acc.concat(v.images || []), []);
        const allOldVariantImages = oldVariants.reduce((acc, v) => acc.concat(v.images || []), []);
        const variantImagesToDelete = allOldVariantImages.filter(img => !allNewVariantImages.includes(img));
        await Promise.all(variantImagesToDelete.map(url => deleteFromFirebase(url)));
      }
    } catch (deleteError) {
      console.warn("Non-critical error deleting orphaned images:", deleteError);
    }

    // --- Section 5: Update Database and Respond ---
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, ownerId: ownerId },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate("category", "categoryName");

    if (!updatedProduct) {
      return res
        .status(500)
        .json({ message: "Product update failed.", success: false });
    }

    console.log("✅ Product Updated Successfully:", updatedProduct._id);
    res.status(200).json({
      data: updatedProduct,
      message: "Product updated successfully",
      success: true,
    });
  } catch (error) {
    console.error("❌ Error updating product:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        errors: error.errors,
        message: "Validation failed",
        success: false,
      });
    }
    res.status(500).json({
      error: error.message,
      message: "Error updating product",
      success: false,
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    const product = await Product.findOne({
      _id: id,
      ownerId: ownerId,
    }).populate("category", "categoryName");

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
        success: false,
      });
    }

    res.status(200).json({
      data: product,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      error: error.message,
      message: "Server error",
      success: false,
    });
  }
};

// Get all public products for a store (unauthenticated)
export const getPublicProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    const query = {
      ownerId,
      // For public users, only show active and in-stock products
      "flags.isBlocked": false,
      // inStock: true, // Check baseStock or variants
    };

    const products = await Product.find(query)
      .populate("category", "categoryName")
      .lean();

    // Fetch all active offers
    const now = new Date();
    const activeOffers = await Offer.find({
      ownerId,
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();

    // Create maps for efficient lookups
    const productOffersMap = new Map();
    const categoryOffersMap = new Map();
    let siteOffer = null;

    activeOffers.forEach(offer => {
      if (offer.scope === 'product') {
        offer.appliesToProducts.forEach(pId => {
          if (!productOffersMap.has(pId.toString())) productOffersMap.set(pId.toString(), offer);
        });
      } else if (offer.scope === 'category') {
        offer.appliesToCategories.forEach(cId => {
          if (!categoryOffersMap.has(cId.toString())) categoryOffersMap.set(cId.toString(), offer);
        });
      } else if (offer.scope === 'all' && !siteOffer) {
        siteOffer = offer;
      }
    });

    // Map offers to products
    const productsWithOffers = products.map((product) => {
      let bestOffer = productOffersMap.get(product._id.toString());

      if (!bestOffer && product.category) {
        const categoryIds = [].concat(product.category).map(c => (c._id || c).toString());
        for (const catId of categoryIds) {
          const offer = categoryOffersMap.get(catId);
          if (offer) {
            bestOffer = offer;
            break;
          }
        }
      }

      if (!bestOffer) bestOffer = siteOffer;

      const flashSaleOffer = bestOffer?.displayType === 'flash_sale' ? bestOffer : null;

      return {
        ...product,
        offer: bestOffer ? { title: bestOffer.title, discountType: bestOffer.discountType, discountValue: bestOffer.discountValue, buyQuantity: bestOffer.buyQuantity, getQuantity: bestOffer.getQuantity } : null,
        flashSaleEndTime: flashSaleOffer ? flashSaleOffer.endTime : null,
        hasFlashSale: !!flashSaleOffer,
      };
    });

    res.status(200).json({ data: productsWithOffers, success: true });
  } catch (err) {
    console.error("Error fetching public products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public flash sale products
export const getPublicFlashSaleProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    const now = new Date();
    // Find active AND upcoming flash sale offers
    const flashSales = await Offer.find({
      endTime: { $gt: now }, // Fetch all sales ending in the future,
      isActive: true,
      offerTimeType: "flash_sale",
      ownerId,
    }).lean();

    if (!flashSales.length) {
      return res.status(200).json({ data: [], success: true });
    }

    // Extract product and category IDs from offers
    const productIds = flashSales
      .filter((o) => o.productId)
      .map((o) => o.productId);
    const categoryIds = flashSales
      .filter((o) => o.categoryId)
      .map((o) => o.categoryId);

    // Find products matching these IDs
    const products = await Product.find({
      $or: [{ _id: { $in: productIds } }, { category: { $in: categoryIds } }],
      // inStock: true,
      "flags.isBlocked": false,
      ownerId,
    })
      .populate("category", "categoryName")
      .lean();

    // Map products to include flash sale details
    const productsWithFlashSale = products.map((product) => {
      // Find the specific offer that applies to this product
      const offer = flashSales.find(
        (o) =>
          (o.productId && o.productId.toString() === product._id.toString()) ||
          (o.categoryId &&
            product.category &&
            (Array.isArray(product.category)
              ? product.category.some(
                  (c) => (c._id || c).toString() === o.categoryId.toString()
                )
              : (product.category._id || product.category).toString() ===
                o.categoryId.toString()))
      );

      const isUpcoming = offer && new Date(offer.startTime) > now;

      return {
        ...product,
        flashSaleEndTime: offer ? offer.endTime : null,
        flashSaleStartTime: offer ? offer.startTime : null,
        flashSaleStatus: isUpcoming ? "upcoming" : "active",
        hasFlashSale: true,
      };
    });

    res.status(200).json({ data: productsWithFlashSale, success: true });
  } catch (err) {
    console.error("Error fetching flash sale products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get a single public product by ID (unauthenticated)
export const getPublicProductById = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const { productId } = req.params;

    const query = {
      _id: productId,
      ownerId,
    };

    const product = await Product.findOne(query)
      .populate("category", "categoryName")
      .lean();

    if (!product) {
      return res.status(404).json({
        message: "Product not found.",
        success: false,
      });
    }

    res.status(200).json({ data: product, success: true });
  } catch (error) {
    console.error("Error fetching public product by ID:", error);
    res
      .status(500)
      .json({ error: error.message, message: "Server error", success: false });
  }
};

// Get public trending products for a store (unauthenticated)
export const getPublicTrendingProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    // Find all active, in-stock products that are marked as trending on the product itself
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isTrending": true,
      ownerId,
    }).populate("category", "categoryName");

    if (!products || products.length === 0) {
      return res.status(200).json({
        data: [],
        message: "No trending products found for this store.",
        success: true,
      });
    }

    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public trending products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};
// Get public products by category for a store (unauthenticated)
export const getPublicProductsByCategory = async (req, res) => {
  try {
    const Category = (await import("../../model/categoryModels.js")).default;
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const { categoryId } = req.params;

    if (!categoryId) {
      return res
        .status(400)
        .json({ message: "Category ID is required.", success: false });
    }

    const category = await Category.findOne({ _id: categoryId, ownerId });

    if (!category) {
      return res
        .status(404)
        .json({ message: "Category not found.", success: false });
    }
    const products = await Product.find({
      ownerId,
      category: categoryId, 
      // Public users can only see active and in-stock products
      "flags.isBlocked": false,
      // inStock: true,
    }).populate("category", "categoryName");

    res.status(200).json({
      data: { categoryName: category.categoryName, products },
      success: true,
    });
  } catch (error) {
    console.error("Error fetching public products by category:", error);
    res
      .status(500)
      .json({ error: error.message, message: "Server error", success: false });
  }
};

// Get public reviews for a product
export const getPublicProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    const reviews = await Review.find({ ownerId, productId })
      .populate("userId", "username") // Populate user details (adjust fields as needed)
      .sort({ createdAt: -1 });

    res.status(200).json({
      data: reviews,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching product reviews:", error);
    res
      .status(500)
      .json({ error: error.message, message: "Server error", success: false });
  }
};

// Get public related products
export const getRelatedProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }

    // The query param from the log is `ProductId`. Let's handle it.
    // It might be duplicated, so req.query.ProductId could be an array.
    const { ProductId, productId } = req.query;
    const currentProductId = ProductId || productId;

    if (!currentProductId) {
      return res
        .status(400)
        .json({ message: "Product ID is required.", success: false });
    }

    // Handle if currentProductId is an array from duplicate query params
    const idToFind = Array.isArray(currentProductId)
      ? currentProductId[0]
      : currentProductId;

    const currentProduct = await Product.findById(idToFind).lean();

    if (
      !currentProduct ||
      !currentProduct.category
    ) {
      return res
        .status(200)
        .json({
          data: [],
          message: "Product has no category or not found.",
          success: true,
        });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: idToFind }, // Exclude the current product
      category: currentProduct.category, // Find in same categories
      ownerId,
      "flags.isBlocked": false,
      // inStock: true,
    }).limit(10); // Limit the number of related products

    res.status(200).json({ data: relatedProducts, success: true });
  } catch (err) {
    console.error("Error fetching related products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// --- Additional Public Product Fetchers ---

// Get public featured products
export const getPublicFeaturedProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isFeatured": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public featured products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public best-seller products
export const getPublicBestSellerProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBestSeller": true,
      "flags.isBlocked": false,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public best-seller products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public recommended products
export const getPublicRecommendedProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isRecommended": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public recommended products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public exclusive products
export const getPublicExclusiveProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isExclusive": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public exclusive products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public special products
export const getPublicSpecialProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isSpecial": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public special products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public popular products
export const getPublicPopularProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isPopular": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public popular products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};

// Get public hot products
export const getPublicHotProducts = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res
        .status(404)
        .json({ message: "Store not found for this domain.", success: false });
    }
    const products = await Product.find({
      // inStock: true,
      "flags.isBlocked": false,
      "flags.isHot": true,
      ownerId,
    }).populate("category", "categoryName");
    res.status(200).json({ data: products, success: true });
  } catch (err) {
    console.error("Error fetching public hot products:", err);
    res
      .status(500)
      .json({ error: err.message, message: "Server error", success: false });
  }
};
