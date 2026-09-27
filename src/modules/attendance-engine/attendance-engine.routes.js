import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import permissionMiddleware from "../../middleware/permission.middleware.js";
import { validate } from "../../common/validators/zod.js";
import { processAttendanceRangeController } from "./attendance-engine.controller.js";
import { processAttendanceRangeSchema } from "./attendance-engine.validation.js";

const router = Router();
router.use(authMiddleware);

router.post(
  "/process",
  validate(processAttendanceRangeSchema),
  permissionMiddleware("attendance", "attendance", "MANAGE"),
  processAttendanceRangeController,
);

export default router;
