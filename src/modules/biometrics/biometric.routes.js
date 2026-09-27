import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import requirePermission from "../../middleware/permission.middleware.js";
import * as controller from "./biometric.controller.js";
import { biometricRateLimit } from "../../middleware/rate-limit.middleware.js";
import { uploadSingle } from "../../middleware/upload.middleware.js";
import * as faceController from "./face.controller.js";
import * as fingerprintController from "./fingerprint.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("biometrics", "biometrics", "READ"), controller.list);
router.get("/:id", requirePermission("biometrics", "biometrics", "READ"), controller.get);
router.post("/register", biometricRateLimit, requirePermission("biometrics", "biometrics", "CREATE"), controller.register);
router.post("/verify", biometricRateLimit, requirePermission("biometrics", "biometrics", "MANAGE"), controller.verify);
router.post("/face/enroll", biometricRateLimit, requirePermission("biometrics", "biometrics", "CREATE"), uploadSingle("face"), faceController.enroll);
router.post("/face/recognize-and-attend", biometricRateLimit, requirePermission("biometrics", "biometrics", "MANAGE"), uploadSingle("face"), faceController.recognizeAndAttend);
router.post("/fingerprint/enroll", biometricRateLimit, requirePermission("biometrics", "biometrics", "CREATE"), fingerprintController.enroll);
router.post("/fingerprint/verify-and-attend", biometricRateLimit, requirePermission("biometrics", "biometrics", "MANAGE"), fingerprintController.verifyAndAttend);
router.post("/verify-and-attend", biometricRateLimit, requirePermission("biometrics", "biometrics", "MANAGE"), controller.verifyAndAttend);
router.delete("/:id", requirePermission("biometrics", "biometrics", "MANAGE"), controller.revoke);

export default router;
