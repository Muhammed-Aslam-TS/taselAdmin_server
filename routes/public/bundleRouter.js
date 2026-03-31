import express from "express";
import { getBundleForProduct, getAllPublicBundles } from "../../controllers/owner/bundleController.js";

const publicBundleRouter = express.Router();

// Fetch all active bundles
publicBundleRouter.get("/all-active", getAllPublicBundles);

// Fetch bundle for a specific product
publicBundleRouter.get("/product/:productId", getBundleForProduct);

export default publicBundleRouter;
