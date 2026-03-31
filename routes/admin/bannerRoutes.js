import express from "express";
import { verifyAccessToken } from "../../middlewares/JWT.js";
import { requireAdmin } from "../../middlewares/authCheck.js";
import { 
  getBanners, 
  getBannerById, 
  createBanner, 
  updateBanner, 
  deleteBanner, 
  updateBannerOrder 
} from "../../controllers/owner/bannerController.js";

const bannerRoutes = express.Router();

// All banner management routes should be protected
bannerRoutes.use(verifyAccessToken);
bannerRoutes.use(requireAdmin);


// Basic CRUD
bannerRoutes.get("/", getBanners);
bannerRoutes.post("/", createBanner);
bannerRoutes.get("/:bannerId", getBannerById);
bannerRoutes.put("/:bannerId", updateBanner);
bannerRoutes.delete("/:bannerId", deleteBanner);

// Route for updating the order of all banners
bannerRoutes.put("/order", updateBannerOrder);

export default bannerRoutes;