import express from "express";
import { getCategories } from "../../controllers/public/publicController.js";
import { getPublicTrendingCategories } from "../../controllers/owner/categoryController.js";




const publicCategoryRouter = express.Router();

publicCategoryRouter.get("/", getCategories);
publicCategoryRouter.get("/featured", getPublicTrendingCategories);


export default publicCategoryRouter;