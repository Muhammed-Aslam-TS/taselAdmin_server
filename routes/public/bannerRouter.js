import express from "express";
import { getBanners } from "../../controllers/public/publicController.js";

const publicBannerRouter = express.Router();

publicBannerRouter.get("/", getBanners);

export default publicBannerRouter;