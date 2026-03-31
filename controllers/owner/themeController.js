
import Theme from "../../model/Theme.js";
import User from "../../model/usersModel.js";

// Helper: Resolve owner
const resolveOwnerId = async (req) => {
  // Case 1: Authenticated user (req.user is set by verifyAccessToken)
  if (req.user?.id) {
    const user = await User.findById(req.user.id).lean();
    return user?.ownerId || req.user.id;
  }
  // Case 2: Unauthenticated visitor (req.owner is set by tenantResolver)
  if (req.owner?._id) {
    return req.owner._id;
  }
  return null;
};

// ---------------------------------------------------------------------
// Core Theme Methods
// ---------------------------------------------------------------------

/**
 * Get the Active Theme (Storefront & Editor)
 * If no active theme, tries to find any theme and activate it,
 * or creates a default one.
 */
export const getTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized: Could not resolve owner." });

    // 1. Try to find the explicitly active theme
    let theme = await Theme.findOne({ ownerId, isActive: true });

    // 2. If no active theme found, check if ANY theme exists for this owner
    if (!theme) {
      theme = await Theme.findOne({ ownerId }).sort({ updatedAt: -1 });
      
      if (theme) {
        // If a theme exists but none are active, activate this one
        theme.isActive = true;
        await theme.save();
      } else {
        // 3. If NO theme exists at all, create a default one
        theme = await Theme.create({
          ownerId,
          themeName: "Default Theme",
          isActive: true,
          sections: [
            { id: "hero-1", type: "hero", order: 1, enabled: true, settings: {} },
            { id: "categories-1", type: "categories", order: 2, enabled: true, settings: {} },
            { id: "featured-1", type: "featuredProducts", order: 3, enabled: true, settings: { limit: 8 } },
          ],
        });
      }
    }

    res.json({ success: true, data: theme });
  } catch (error) {
    console.error("Error fetching theme:", error);
    res.status(500).json({ success: false, message: "Error fetching theme", error: error.message });
  }
};

/**
 * Get All Themes (Theme Library)
 */
export const getAllThemes = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const themes = await Theme.find({ ownerId }).sort({ isActive: -1, updatedAt: -1 });
    
    res.json({ success: true, count: themes.length, data: themes });
  } catch (error) {
    console.error("Error fetching themes:", error);
    res.status(500).json({ success: false, message: "Error fetching themes", error: error.message });
  }
};

/**
 * Create a New Theme
 */
export const createTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const { themeName, sections, settings, colors, fonts, layout, header, footer, customCSS } = req.body;

    const newTheme = await Theme.create({
      ownerId,
      themeName: themeName || "New Custom Theme",
      isActive: false, // Created themes are inactive by default
      sections: sections || [], // Can clone sections from another theme if passed
      settings: settings || {},
      colors: colors || {},
      fonts: fonts || {},
      layout: layout || {},
      header: header || {},
      footer: footer || {},
      customCSS: customCSS || ""
    });

    res.json({ success: true, message: "Theme created successfully", data: newTheme });
  } catch (error) {
    console.error("Error creating theme:", error);
    res.status(500).json({ success: false, message: "Error creating theme", error: error.message });
  }
};

/**
 * Activate a Specific Theme
 * Sets all other themes to inactive.
 */
export const activateTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    const { themeId } = req.params;

    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Deactivate all themes for this owner
    await Theme.updateMany({ ownerId }, { $set: { isActive: false } });

    // 2. Activate the requested theme
    const activatedTheme = await Theme.findOneAndUpdate(
      { _id: themeId, ownerId },
      { $set: { isActive: true, updatedAt: new Date() } },
      { new: true }
    );

    if (!activatedTheme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    res.json({ success: true, message: "Theme activated successfully", data: activatedTheme });
  } catch (error) {
    console.error("Error activating theme:", error);
    res.status(500).json({ success: false, message: "Error activating theme", error: error.message });
  }
};

/**
 * Delete a Specific Theme
 * Cannot delete the active theme.
 */
export const deleteTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    const { themeId } = req.params;

    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const theme = await Theme.findOne({ _id: themeId, ownerId });
    if (!theme) return res.status(404).json({ message: "Theme not found" });

    if (theme.isActive) {
      return res.status(400).json({ message: "Cannot delete the active theme. Please activate another theme first." });
    }

    await Theme.findByIdAndDelete(themeId);

    res.json({ success: true, message: "Theme deleted successfully" });
  } catch (error) {
    console.error("Error deleting theme:", error);
    res.status(500).json({ success: false, message: "Error deleting theme", error: error.message });
  }
};

// ---------------------------------------------------------------------
// Theme Editing Methods (Sections & Settings)
// ---------------------------------------------------------------------

/**
 * Save/Update Theme Settings
 * If request body has _id, updates that specific theme.
 * Otherwise, updates the currently ACTIVE theme.
 */
export const saveTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const themeData = req.body;
    
    // Safety cleanup
    delete themeData.__v;
    delete themeData.ownerId; 
    themeData.updatedAt = new Date();

    let updatedTheme;

    // Check if we are updating a specific theme by ID
    if (themeData._id) {
        updatedTheme = await Theme.findOneAndUpdate(
            { _id: themeData._id, ownerId },
            { $set: themeData },
            { new: true, runValidators: true }
        );
    } 
    // Otherwise update the active theme
    else {
        updatedTheme = await Theme.findOneAndUpdate(
            { ownerId, isActive: true },
            { $set: themeData },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // Edge case: if upsert happened but isActive wasn't set, ensure it's active
        if (updatedTheme && !updatedTheme.isActive) {
           updatedTheme.isActive = true;
           await updatedTheme.save();
        }
    }

    res.json({
      success: true,
      message: "Theme saved successfully",
      data: updatedTheme,
    });
  } catch (error) {
    console.error("Error saving theme:", error);
    res.status(500).json({
      success: false,
      message: "Error saving theme",
      error: error.message,
    });
  }
};

/**
 * Update Sections (Drag & Drop Reordering)
 * Operates on the ACTIVE theme by default.
 */
export const updateSections = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const { sections } = req.body;

    const updatedTheme = await Theme.findOneAndUpdate(
      { ownerId, isActive: true },
      { $set: { sections, updatedAt: new Date() } },
      { new: true }
    );

    if (!updatedTheme) return res.status(404).json({ message: "Active theme not found" });

    res.json({ success: true, message: "Sections updated", data: updatedTheme });
  } catch (error) {
    console.error("Error updating sections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add New Section
 * Operates on the ACTIVE theme.
 */
export const addSection = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const { type, model, settings = {} } = req.body;

    // Get Active Theme
    let theme = await Theme.findOne({ ownerId, isActive: true });
    
    if (!theme) {
       // If no theme, create default one
       theme = await Theme.create({
         ownerId,
         themeName: "Default Theme",
         isActive: true,
         sections: [],
       });
    }

    const sectionId = `${type}-${Date.now()}`;
    const maxOrder = theme.sections.length > 0 ? Math.max(...theme.sections.map((s) => s.order)) : 0;

    const newSection = {
      id: sectionId,
      type,
      model,
      order: maxOrder + 1,
      enabled: true,
      settings,
    };

    const updatedTheme = await Theme.findOneAndUpdate(
      { _id: theme._id },
      { $push: { sections: newSection }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    res.json({ success: true, message: "Section added", data: newSection });
  } catch (error) {
    console.error("Error adding section:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Section Settings
 * Operates on the ACTIVE theme.
 */
export const updateSection = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    const { sectionId } = req.params;
    const { settings, enabled } = req.body;

    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const updateFields = {};
    if (settings !== undefined) updateFields["sections.$.settings"] = settings;
    if (enabled !== undefined) updateFields["sections.$.enabled"] = enabled;
    updateFields["updatedAt"] = new Date();

    const updatedTheme = await Theme.findOneAndUpdate(
      { ownerId, isActive: true, "sections.id": sectionId },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedTheme) {
      return res.status(404).json({ message: "Section or Active Theme not found" });
    }

    const section = updatedTheme.sections.find((s) => s.id === sectionId);
    res.json({ success: true, message: "Section updated", data: section });
  } catch (error) {
    console.error("Error updating section:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Section
 * Operates on the ACTIVE theme.
 */
export const deleteSection = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    const { sectionId } = req.params;

    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    const updatedTheme = await Theme.findOneAndUpdate(
      { ownerId, isActive: true },
      {
        $pull: { sections: { id: sectionId } },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );

    if (!updatedTheme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    res.json({ success: true, message: "Section deleted", data: updatedTheme });
  } catch (error) {
    console.error("Error deleting section:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Reset Theme (Resets ACTIVE theme)
 */
export const resetTheme = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

    // Find active theme and reset its sections
    // Alternatively, we could delete it and create new, but better to keep ID
    const activeTheme = await Theme.findOne({ ownerId, isActive: true });

    if (activeTheme) {
        activeTheme.sections = [
            { id: "hero-1", type: "hero", order: 1, enabled: true, settings: {} },
            { id: "categories-1", type: "categories", order: 2, enabled: true, settings: {} },
            { id: "featured-1", type: "featuredProducts", order: 3, enabled: true, settings: { limit: 8 } },
        ];
        activeTheme.updatedAt = new Date();
        await activeTheme.save();
        return res.json({ success: true, message: "Theme reset", data: activeTheme });
    }

    // If no active theme, create a new default one
    const defaultTheme = await Theme.create({
      ownerId,
      themeName: "Default Theme",
      isActive: true,
      sections: [
        { id: "hero-1", type: "hero", order: 1, enabled: true, settings: {} },
        { id: "categories-1", type: "categories", order: 2, enabled: true, settings: {} },
        { id: "featured-1", type: "featuredProducts", order: 3, enabled: true, settings: { limit: 8 } },
      ],
    });

    res.json({ success: true, message: "Theme reset", data: defaultTheme });
  } catch (error) {
    console.error("Error resetting theme:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
