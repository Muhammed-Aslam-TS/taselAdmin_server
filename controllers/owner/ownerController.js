import { generateAccessToken } from "../../middlewares/JWT.js";
import Owner from "../../model/OwnerModels.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { processBase64Image, deleteFromFirebase } from "../../middlewares/base64Convert.js";
import User from "../../model/usersModel.js";
import Subscription from "../../model/subscriptionModel.js";
import axios from "axios";
import shiprocketService from "../../services/shiprocketService.js";

// Create initial trial subscription for new owner
// const createTrialSubscription = async (ownerId) => {
//   try {
//     const startDate = new Date();
//     const trialEndDate = new Date(startDate);
//     trialEndDate.setMonth(trialEndDate.getMonth() + 2); // 2 months trial

//     const subscription = new Subscription({
//       ownerId,
//       plan: "FREE",
//       status: "TRIAL",
//       startDate,
//       endDate: trialEndDate,
//       trialEndDate,
//       features: Subscription.getPlanFeatures("FREE"),
//     });

//     await subscription.save();
//     return subscription;
//   } catch (error) {
//     console.error("Error creating trial subscription:", error);
//     throw error;
//   }
// };

// Function to create a new owner
export const loginOwner = async (req, res) => {
  try {
    console.log(`[OwnerController] Attempting login...`);
    
    const { email, password } = req.body;

    console.log(`[OwnerController] Login request received for email: ${email}`);

    // 1️⃣ Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // 2️⃣ Check if owner exists
    const owner = await Owner.findOne({ email });
    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    // 3️⃣ Ensure the owner has a valid password field
    if (!owner.password) {
      console.error(`Owner ${owner._id} has no password field in DB`);
      return res.status(500).json({ message: "Invalid password data in database" });
    }

    // 4️⃣ Validate password safely
    const isPasswordValid = await bcrypt.compare(password, owner.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 5️⃣ Generate access token
    const token = generateAccessToken(owner, "owner");

    // 6️⃣ Send success response
    res.status(200).json({
      message: "Login successful",
      owner,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};


// export const createOwner = async (req, res) => {
//   try {
//     const { username, companyAddress, mobile, companyName, email, password } =
//       req.body;

//     // Validate required fields
//     if (
//       !username ||
//       !companyAddress ||
//       !mobile ||
//       !companyName ||
//       !email ||
//       !password
//     ) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // Check if owner already exists
//     const existingOwner = await Owner.findOne({ email });
//     if (existingOwner) {
//       return res
//         .status(400)
//         .json({ message: "Owner with this email already exists" });
//     }

//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create a new owner
//     const newOwner = new Owner({
//       username,
//       companyAddress,
//       mobile,
//       companyName,
//       email,
//       password: hashedPassword, // Save the hashed password
//     });
//     await newOwner.save();

//     // Create trial subscription
//     const subscription = await createTrialSubscription(newOwner._id);

//     const token = generateAccessToken(newOwner); // Generate token using the new user

//     // Create referral code using the owner's ID (e.g., base36 short form)
//     const referralCode = `REF-${newOwner._id
//       .toString()
//       .slice(-6)
//       .toUpperCase()}`;

//     // Optionally, save the referral code in the Owner document
//     newOwner.referralCode = referralCode;
//     await newOwner.save();

//     res.status(201).json({
//       message: "Owner created successfully",
//       user: newOwner,
//       token,
//       referralCode, // include it in the response if needed
//       subscription: {
//         plan: subscription.plan,
//         status: subscription.status,
//         trialEndDate: subscription.trialEndDate,
//         features: subscription.features
//       }
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// };

export const getOwnerByReferralCode = async (req, res) => {
  const ownerId = req.user.id;

  try {
    const owner = await Owner.findById(ownerId);

    if (!owner) {
      return res.status(404).json({ message: "Invalid referral code" });
    }

    // Send back limited owner info (only public fields)
    res.status(200).json({
      ownerReferralCode: owner.referralCode,
      ownerId: owner._id,
      companyName: owner.companyName,
      username: owner.username,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getAllOwners = async (req, res) => {
  try {
    const owners = await Owner.find();
    res.status(200).json(owners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const BlockUnblockOwner = async (req, res) => {
  const { ownerId } = req.params;

  try {
    // First find the owner to check current isActive status
    const owner = await Owner.findById(ownerId);

    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    // Only update if isActive is currently true
    if (owner.isActive === true) {
      const updatedOwner = await Owner.findByIdAndUpdate(
        ownerId,
        { isActive: false },
        { new: true }
      );
      return res.status(200).json({
        message: "Owner deactivated successfully",
        owner: updatedOwner,
      });
    } else {
      const updatedOwner = await Owner.findByIdAndUpdate(
        ownerId,
        { isActive: true },
        { new: true }
      );
      return res.status(200).json({
        message: "Owner deactivated successfully",
        owner: updatedOwner,
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getOwnerInfo = async (req, res) => {
  try {


    
    const ownerId = req.user.id; // Get owner ID from authenticated user

    const owner = await Owner.findById(ownerId).select("-password"); // Exclude password from response

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Owner information retrieved successfully",
      data: owner,
    });
  } catch (error) {
    console.error(`[OwnerController] Get owner info error:`, error);
    res.status(500).json({
      success: false,
      message: "Error retrieving owner information",
      error: error.message,
    });
  }
};
export const updateOwnerInfo = async (req, res) => {
  try {
    const ownerId = req.user.id;
    let {
      username,
      mobile,
      companyName,
      companyAddress,
      razorpayKeyId,
      razorpayKeySecret,
      cashfreeAppId,
      cashfreeSecretKey,
      cashfreeMode,
      idProof,
      logo,
      primaryDomain,
      domain,
      // Shiprocket owner credentials
      shiprocketEmail,
      shiprocketPassword,
      // shiprocketAccountId,
      // shiprocketAuthToken,
      
      // Warehouse Address
      warehouseAddress,
      
      // Settings
      guestUserEnabled
    } = req.body;

    // Parse warehouseAddress if it comes as a JSON string (from FormData)
    if (warehouseAddress && typeof warehouseAddress === 'string') {
        try {
            warehouseAddress = JSON.parse(warehouseAddress);
        } catch (e) {
            console.error('Failed to parse warehouseAddress JSON', e);
        }
    }
    
    // Handle frontend sending 'domain' instead of 'primaryDomain'
    if (domain && !primaryDomain) {
      primaryDomain = domain;
    }

    console.log(`[OwnerController] Profile update request for domain: ${primaryDomain || domain}`);

    // Check subscription status

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner ID format",
      });
    }

    // Find owner first
    const owner = await Owner.findById(ownerId);
    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    // Check username if it's being updated
    if (username && username !== owner.username) {
      const existingUsername = await Owner.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
    }

    // Check domain if it's being updated
    if (primaryDomain && primaryDomain !== owner.primaryDomain) {
      const existingDomain = await Owner.findOne({ primaryDomain });
      if (existingDomain) {
        return res.status(400).json({
          success: false,
          message: "Domain is already taken.",
        });
      }
    }

    // Process image uploads in parallel
    const [logoUrl, idProofUrl] = await Promise.all([
      processImage(logo, owner.logo, "logo"),
      processImage(idProof, owner.idProof, "ID proof"),
    ]);

    // Prepare update fields
    const updateFields = {
      ...(username && { username }),
      ...(mobile && { mobile }),
      ...(companyName && { companyName }),
      ...(companyAddress && { companyAddress }),
      ...(logoUrl && { logo: logoUrl }),
      ...(razorpayKeyId && { razorpayKeyId }),
      ...(razorpayKeySecret && { razorpayKeySecret }),
      ...(cashfreeAppId && { cashfreeAppId }),
      ...(cashfreeSecretKey && { cashfreeSecretKey }),
      ...(cashfreeMode && { cashfreeMode }),
      ...(idProofUrl && { idProof: idProofUrl }),
      ...(shiprocketEmail !== undefined && { shiprocketEmail }),
      ...(shiprocketPassword !== undefined && { shiprocketPassword }),
      ...(domain && { domain }),
      ...(primaryDomain && { primaryDomain }),
      ...(warehouseAddress && { warehouseAddress }),
      ...(guestUserEnabled !== undefined && { 'settings.guestUserEnabled': guestUserEnabled === 'true' || guestUserEnabled === true }),
      // ...(shiprocketAccountId && { shiprocketAccountId }),
      // ...(shiprocketAuthToken && { shiprocketAuthToken }),
      // ...(shiprocketPayMerchantId && { shiprocketPayMerchantId }),
      // ...(shiprocketPayKey && { shiprocketPayKey }),
      // ...(shiprocketPaySecret && { shiprocketPaySecret }),
    };

    // Update owner information
    const updatedOwner = await Owner.findByIdAndUpdate(
      ownerId,
      { $set: updateFields },
      { new: true }
    ).select("-password -shiprocketPassword -shiprocketAuthToken -shiprocketPaySecret");

    if (!updatedOwner) {
      return res.status(500).json({
        success: false,
        message: "Failed to update owner information",
      });
    }

    // Sync warehouse address to Shiprocket in background
    if (warehouseAddress && updatedOwner.shiprocketEmail) {
        const pickupDetails = updatedOwner.warehouseAddress;
        (async () => {
            try {
                const pickupPayload = {
                    pickup_location: pickupDetails.pickupLocation,
                    name: pickupDetails.name,
                    email: pickupDetails.email,
                    phone: pickupDetails.phone,
                    address: pickupDetails.address,
                    address_2: pickupDetails.address2,
                    city: pickupDetails.city,
                    state: pickupDetails.state,
                    country: pickupDetails.country || 'India',
                    pin_code: pickupDetails.pincode
                };
                // Remove undefined
                Object.keys(pickupPayload).forEach(key => pickupPayload[key] === undefined && delete pickupPayload[key]);
                
                await shiprocketService.addPickupLocation(pickupPayload, ownerId);
            } catch (err) {
                console.error('Failed to sync pickup location to Shiprocket:', err.message);
            }
        })();
    }

    return res.status(200).json({
      success: true,
      message: "Owner information updated successfully",
      data: updatedOwner,
    });
  } catch (error) {
    console.error("Update owner info error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating owner information",
      error: error.message,
    });
  }
};
export const getLogo = async (req, res) => {
  try {
    const userId = req.user.id;
    let ownerId;

    // If it's a user, get the owner ID from their profile
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    ownerId = user.ownerId;
    const owner = await Owner.findById(ownerId); // Fetch the owner object

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }
    const ownerLogo = owner.logo;
    if (!ownerLogo) {
      return res.status(404).json({
        success: false,
        message: "Owner logo not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Logo retrieved successfully",
      logo: ownerLogo,
    });
  } catch (error) {
    console.error("Get logo error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving logo",
      error: error.message,
    });
  }
};

export const getOwnerLogoAsBase64 = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const owner = await Owner.findById(ownerId);

    if (!owner || !owner.logo) {
      return res.status(404).json({ success: false, message: "Logo not found" });
    }

    // If it's already base64 (unlikely but possible if legacy data)
    if (owner.logo.startsWith('data:')) {
       return res.status(200).json({ success: true, logoBase64: owner.logo });
    }

    const response = await axios.get(owner.logo, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'];
    const dataURI = `data:${mimeType};base64,${base64}`;

    res.status(200).json({ success: true, logoBase64: dataURI });
  } catch (error) {
    console.error("Error fetching logo base64:", error);
    res.status(500).json({ success: false, message: "Failed to fetch logo" });
  }
};

// Helper function to process image uploads
const processImage = async (image, existingUrl, type) => {
  // If no image or not a string, return existing URL
  if (!image || typeof image !== "string") {
    return existingUrl;
  }

  // If it's already a URL and same as existing, just return
  if (image.startsWith('http') && image === existingUrl) {
    return existingUrl;
  }

  try {
    let base64Image = image;
    if (!image.startsWith("data:image")) {
      base64Image = `data:image/jpeg;base64,${image}`;
    }

    const url = await processBase64Image(base64Image);

    if (!url) {
      throw new Error(`Failed to upload ${type}`);
    }

    // Delete old image if upload successful
    if (existingUrl) {
      await deleteFromFirebase(existingUrl);
    }

    return url;
  } catch (error) {
    console.error(`${type} upload error:`, error);
    throw new Error(`Error uploading ${type}: ${error.message}`);
  }
};

export const deleteOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;

    // Validate if ownerId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid owner ID format" 
      });
    }

    // Find the owner to ensure existence
    const owner = await Owner.findById(ownerId);
    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: "Owner not found" 
      });
    }

    // Delete the owner
    // Use findByIdAndDelete to trigger any mongoose middlewares if present
    await Owner.findByIdAndDelete(ownerId);

    // Delete associated subscription
    await Subscription.deleteOne({ ownerId });

    // Delete assets from Firebase
    if (owner.logo) await deleteFromFirebase(owner.logo);
    if (owner.idProof) await deleteFromFirebase(owner.idProof);

    res.status(200).json({
      success: true,
      message: "Owner deleted successfully and assets cleared",
      deletedId: ownerId
    });

  } catch (error) {
    console.error("Delete owner error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting owner",
      error: error.message
    });
  }
};
