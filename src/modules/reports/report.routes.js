import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import requirePermission from "../../middleware/permission.middleware.js";
import { report } from "./report.controller.js";
import { exportReport } from "./report.export.controller.js";

const router=Router(); router.use(authenticate);
router.get("/export/:type",requirePermission("reports","reports","EXPORT"),exportReport);
router.get("/:type",requirePermission("reports","reports","READ"),report);
export default router;
