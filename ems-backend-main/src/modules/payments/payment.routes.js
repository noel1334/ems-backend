import { Router } from "express";
import * as controller from "./payment.controller.js";
import authenticate from "../../middleware/auth.middleware.js";
import requirePermission from "../../middleware/permission.middleware.js";
import { paymentRateLimit } from "../../middleware/rate-limit.middleware.js";

const router = Router();

router.post("/webhooks/paystack", controller.paystackWebhook);
router.post("/webhooks/flutterwave", controller.flutterwaveWebhook);

router.use(authenticate);
router.get("/", requirePermission("payments", "payments", "READ"), controller.list);
router.get("/:id", requirePermission("payments", "payments", "READ"), controller.getOne);
router.post("/initialize", paymentRateLimit, requirePermission("payments", "payments", "CREATE"), controller.initialize);
router.post("/verify", paymentRateLimit, requirePermission("payments", "payments", "MANAGE"), controller.verify);

export default router;
