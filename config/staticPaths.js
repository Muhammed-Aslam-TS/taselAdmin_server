import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory (ecomerceServer folder)
const baseDir = path.dirname(__dirname);

// Static file paths configuration
const staticPaths = {
  // Dist folder paths for different frontend builds
  dist: {
    // EcommerceByowner dist folder
    owner: path.join(baseDir, "../EcommerceByowner/dist"),
    // EcommerceByAdmin dist folder  
    admin: path.join(baseDir, "../EcommerceByAdmin/dist"),
    // Default dist folder (if you have a single frontend)
    default: path.join(baseDir, "../dist"),
    // Additional dist folders if needed
    user: path.join(baseDir, "../EcommerceByUser/dist"),
    mobile: path.join(baseDir, "../EcommerceMobile/dist")
  },
  
  // Upload paths
  uploads: {
    images: path.join(baseDir, "uploads/images"),
    documents: path.join(baseDir, "uploads/documents"),
    temp: path.join(baseDir, "uploads/temp")
  },
  
  // Public assets
  public: {
    assets: path.join(baseDir, "public/assets"),
    css: path.join(baseDir, "public/css"),
    js: path.join(baseDir, "public/js")
  }
};

// Route configurations for different frontend apps
const routeConfig = {
  owner: {
    path: '/owner',
    distPath: staticPaths.dist.owner,
    name: 'EcommerceByowner',
    description: 'Owner/Store Management Interface'
  },
  admin: {
    path: '/admin', 
    distPath: staticPaths.dist.admin,
    name: 'EcommerceByAdmin',
    description: 'Admin Management Interface'
  },
  user: {
    path: '/user',
    distPath: staticPaths.dist.user,
    name: 'EcommerceByUser', 
    description: 'User Shopping Interface'
  },
  mobile: {
    path: '/mobile',
    distPath: staticPaths.dist.mobile,
    name: 'EcommerceMobile',
    description: 'Mobile App Interface'
  },
  default: {
    path: '/',
    distPath: staticPaths.dist.default,
    name: 'Default',
    description: 'Default Frontend Interface'
  }
};

// Validation function to check if dist folders exist
const validateDistFolders = () => {
  const results = {};
  
  Object.entries(staticPaths.dist).forEach(([key, distPath]) => {
    try {
      const exists = fs.existsSync(distPath);
      const indexExists = fs.existsSync(path.join(distPath, 'index.html'));
      results[key] = {
        path: distPath,
        exists,
        hasIndex: indexExists,
        status: exists && indexExists ? '✅ Ready' : exists ? '⚠️ No index.html' : '❌ Not found'
      };
    } catch (error) {
      results[key] = {
        path: distPath,
        exists: false,
        hasIndex: false,
        status: '❌ Error checking',
        error: error.message
      };
    }
  });
  
  return results;
};

// Get available routes (only those with existing dist folders)
const getAvailableRoutes = () => {
  const validation = validateDistFolders();
  const available = {};
  
  Object.entries(routeConfig).forEach(([key, config]) => {
    const validationResult = validation[config.distPath.split('/').pop()] || validation.default;
    if (validationResult.exists && validationResult.hasIndex) {
      available[key] = {
        ...config,
        status: '✅ Available'
      };
    }
  });
  
  return available;
};

export default {
  staticPaths,
  routeConfig,
  validateDistFolders,
  getAvailableRoutes
}; 