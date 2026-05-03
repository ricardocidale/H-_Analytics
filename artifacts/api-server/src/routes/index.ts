import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { propertySlidesRouter } from "./property-slides";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertySlidesRouter);

export default router;
