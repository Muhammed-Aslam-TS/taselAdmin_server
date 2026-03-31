import express from "express";
import { getPublicPartners } from "../../controllers/owner/partnerController.js";

const publicPartnerRouter = express.Router();

// Public endpoint available to anyone on the storefront
publicPartnerRouter.get("/", getPublicPartners);

export default publicPartnerRouter;
