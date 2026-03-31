import User from "../../model/usersModel.js";




export const getAllUsersForOwner = async (req, res) => {
  try {
    // Assuming owner's ID is available on req.owner from an auth middleware
    const ownerId = req.user.id;

    const users = await User.find({ ownerId }).select('-password')
console.log(users,"--------users")
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users for owner:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


export const getUserByIdForOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const userId = req.params.id;

    const user = await User.findOne({ _id: userId, ownerId }).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found or does not belong to this owner.' });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error fetching user by ID for owner:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


export const updateUserForOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const userId = req.params.id;
    console.log(userId,"--------userId");

    
    const { username, email, mobile, isActive } = req.body;

    // First, verify the user belongs to the owner
    const user = await User.findOne({ _id: userId, ownerId });
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found or does not belong to this owner.' });
    }

    // Build the update object with provided fields
    const updateFields = {};
    if (username) updateFields.username = username;
    if (email) updateFields.email = email;
    if (mobile) updateFields.mobile = mobile;
    // Only update isActive if it's explicitly provided as a boolean
    if (typeof isActive === 'boolean') {
      updateFields.isActive = isActive;
    }

    if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update were provided.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true, runValidators: true, context: 'query' }
    ).select('-password');

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user for owner:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Update failed. Email or mobile already in use.' });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


export const deleteUserForOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const userId = req.params.id;

    const user = await User.findOneAndDelete({ _id: userId, ownerId });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found or does not belong to this owner.' });
    }

    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user for owner:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};