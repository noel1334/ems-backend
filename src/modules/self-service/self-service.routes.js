import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import * as c from "./self-service.controller.js";

const router = Router();
router.use(authenticate);
router.get("/me", c.profile);
router.get("/attendance", c.attendance);
router.get("/schedule", c.schedule);
router.get("/leave", c.leave);
router.get("/payslips", c.payslips);
export default router;
