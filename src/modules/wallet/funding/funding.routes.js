import { Router } from "express";
import authenticate from "../../../middleware/auth.middleware.js";
import requirePermission from "../../../middleware/permission.middleware.js";
import * as controller from "./funding.controller.js";

const router = Router();
router.use(authenticate);
router.post("/initialize", requirePermission("payments", "payments", "CREATE"), controller.initialize);
router.post("/verify", requirePermission("payments", "payments", "MANAGE"), controller.verify);
export default router;
