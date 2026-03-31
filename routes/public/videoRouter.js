import express from "express";
import { getStoreVideos } from "../../controllers/public/publicController.js";

const publicVideoRouter = express.Router();

publicVideoRouter.get("/", getStoreVideos);

export default publicVideoRouter;
