import express from "express";
import { fetchRelatedProducts, getProducts, getReviewsByProductId, searchProducts } from "../../controllers/public/publicController.js";
import { 
    getPublicProducts, 
    getPublicProductById, 
    getPublicTrendingProducts, 
    getPublicProductsByCategory,
    getPublicFeaturedProducts,
    getPublicBestSellerProducts,
    getPublicRecommendedProducts,
    getPublicExclusiveProducts,
    getPublicSpecialProducts,
    getPublicPopularProducts,
    getPublicHotProducts
} from "../../controllers/owner/productController.js";

const publicProductRouter = express.Router();

publicProductRouter.get("/", getProducts);

publicProductRouter.get("/search", searchProducts);

publicProductRouter.get("/category/:categoryId", getPublicProductsByCategory);

publicProductRouter.get("/trending", getPublicTrendingProducts);

// --- Routes for other product flags ---
publicProductRouter.get("/featured", getPublicFeaturedProducts);
publicProductRouter.get("/bestseller", getPublicBestSellerProducts);
publicProductRouter.get("/recommended", getPublicRecommendedProducts);
publicProductRouter.get("/exclusive", getPublicExclusiveProducts);
publicProductRouter.get("/special", getPublicSpecialProducts);
publicProductRouter.get("/popular", getPublicPopularProducts);
publicProductRouter.get("/hot", getPublicHotProducts);
publicProductRouter.get("/RelatedProducts", fetchRelatedProducts);

// Route to get reviews for a product
publicProductRouter.get("/reviews/:productId", getReviewsByProductId);


publicProductRouter.get("/:productId", getPublicProductById);

export default publicProductRouter;