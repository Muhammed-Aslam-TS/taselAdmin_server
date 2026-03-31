import express from "express";
import { getPublicOwnerInfo, getTheme } from "../../controllers/public/publicController.js";


const publicThemeRouter = express.Router();


publicThemeRouter.get("/", getTheme);
publicThemeRouter.get("/ownerInfo", getPublicOwnerInfo);


export default publicThemeRouter;