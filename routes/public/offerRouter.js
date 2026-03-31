import { Router } from 'express';
import { getOffers, getTimeBasedOffer } from '../../controllers/public/publicController.js';

const publicOfferRouter = Router();

// These routes are public and resolve the store via domain name

// Get all active offers for the store
publicOfferRouter.get("/", getOffers);

// Get the current time-based offer for the store
publicOfferRouter.get("/time-based", getTimeBasedOffer);

export default publicOfferRouter;
