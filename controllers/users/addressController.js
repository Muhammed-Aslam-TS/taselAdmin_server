import Address from "../../model/addressModel.js";

export const createAddress = async (req, res) => {
  try {
    const { 
      address, 
      city, 
      country, 
      firstName: rawFirstName, 
      lastName: rawLastName, 
      fullName,  // Accept fullName from frontend
      isDefault, 
      landmark, 
      phone, 
      state, 
      type, 
      zipCode: rawZipCode,
      pincode  // Accept pincode from frontend
    } = req.body;
    const userId = req.user.id;

    console.log("Creating address payload:", address);

    // Handle field name variations from frontend
    const zipCode = rawZipCode || pincode;
    
    // Handle fullName -> firstName + lastName conversion
    let firstName = rawFirstName;
    let lastName = rawLastName;
    if (!firstName && fullName) {
      const nameParts = fullName.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    // --- Validation for required fields ---
    const requiredFields = { address, city, fullName, state, zipCode };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (value === undefined || value === null || String(value).trim() === '') {
        return res.status(400).json({
          message: `Missing or invalid required field: ${field}`,
          success: false,
        });
      }
    }
    // If setting as default, unset previous default
    if (isDefault) {
      await Address.updateMany({ userId }, { isDefault: false });
    }

    

    // Validate phone number format if provided
    if (phone) {
      const phoneRegex = /^(?:0|91)?[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          message: "Invalid phone number format. It must be a valid Indian mobile number.",
          success: false,
        });
      }
    }

    const newAddress = new Address({
      address,
      city,
      country: country || 'India',
      firstName,
      isDefault: isDefault || false,
      landmark,
      lastName,
      phone,
      state,
      type: type || 'shipping',
      userId,
      zipCode
    });

    const savedAddress = await newAddress.save();
    res.status(201).json({ 
      data: savedAddress, 
      message: "Address added successfully", 
      success: true 
    });
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({ 
      error: error.message, 
      message: "Failed to add address", 
      success: false 
    });
  }
};

export const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const totalAddresses = await Address.countDocuments({ userId });
    const totalPages = Math.ceil(totalAddresses / limit);

    const addresses = await Address.find({ userId })
      .sort({ createdAt: -1, isDefault: -1 }) // Default first, then newest
      .skip(skip)
      .limit(limit);
    
    res.status(200).json({
      data: addresses,
      pagination: { currentPage: page, totalPages, totalAddresses },
      success: true
    });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ 
      error: error.message, 
      message: "Failed to fetch addresses", 
      success: false 
    });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { address, city, country, firstName, isDefault, landmark, lastName, phone, state, type, zipCode } = req.body;
    const userId = req.user.id;

    // Validate phone number format if provided
    if (phone) {
      const phoneRegex = /^(?:0|91)?[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          message: "Invalid phone number format. It must be a valid Indian mobile number.",
          success: false,
        });
      }
    }

    const addressToUpdate = await Address.findOne({ _id: id, userId });

    if (!addressToUpdate) {
      return res.status(404).json({
        message: "Address not found",
        success: false,
      });
    }

    // If setting as default, unset previous default
    if (isDefault) {
      await Address.updateMany({ _id: { $ne: id }, userId }, { isDefault: false });
    }

    if (address) addressToUpdate.address = address;
    if (city) addressToUpdate.city = city;
    if (firstName) addressToUpdate.firstName = firstName;
    if (lastName) addressToUpdate.lastName = lastName;
    if (phone) addressToUpdate.phone = phone;
    if (state) addressToUpdate.state = state;
    if (landmark) addressToUpdate.landmark = landmark;
    if (zipCode) addressToUpdate.zipCode = zipCode;
    if (country) addressToUpdate.country = country;
    if (type) addressToUpdate.type = type;
    if (typeof isDefault === 'boolean') addressToUpdate.isDefault = isDefault;

    const updatedAddress = await addressToUpdate.save();

    res.status(200).json({
      data: updatedAddress,
      message: "Address updated successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to update address",
      success: false,
    });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deletedAddress = await Address.findOneAndDelete({ _id: id, userId });

    if (!deletedAddress) {
      return res.status(404).json({
        message: "Address not found",
        success: false,
      });
    }

    res.status(200).json({
      message: "Address deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to delete address",
      success: false,
    });
  }
};


export const getAddressesCheckout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch ALL addresses for the user, sorted with default first
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    
    console.log(`📬 Found ${addresses.length} addresses for user ${userId}`);
    
    res.status(200).json({
      data: addresses,
      success: true
    });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ 
      error: error.message, 
      message: "Failed to fetch addresses", 
      success: false 
    });
  }
};