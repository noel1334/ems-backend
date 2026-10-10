import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import requirePermission from "../../middleware/permission.middleware.js";
import * as controller from "./audit.controller.js";

const router = Router();
router.use(authenticate);
router.get("/export", requirePermission("audit", "audit", "EXPORT"), controller.exportCsv);
router.get("/", requirePermission("audit", "audit", "READ"), controller.list);
router.get("/:id", requirePermission("audit", "audit", "READ"), controller.get);
export default router;
