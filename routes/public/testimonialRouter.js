import express from "express";
import { getPublicTestimonials } from "../../controllers/owner/testimonialController.js";

const publicTestimonialRouter = express.Router();

// Public endpoint available to anyone on the storefront
publicTestimonialRouter.get("/", getPublicTestimonials);

export default publicTestimonialRouter;
