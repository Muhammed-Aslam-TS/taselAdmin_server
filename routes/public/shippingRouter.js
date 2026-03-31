import { Router } from "express";
import { getPublicShippingConfig } from "../../controllers/owner/manageShipping.js";

const publicShippingRouter = Router();

// Public route to get shipping configuration
publicShippingRouter.get("/config", getPublicShippingConfig);

export default publicShippingRouter;
