import { Router } from "express";

import * as controller from "./payment.controller.js";

import authenticate from "../../middleware/auth.middleware.js";

import requirePermission from "../../middleware/permission.middleware.js";

const router = Router();

/*
 * Provider webhooks do not use normal
 * application authentication.
 *
 * They are authenticated using
 * provider signatures/hashes.
 */

router.post("/webhooks/paystack", controller.paystackWebhook);

router.post("/webhooks/flutterwave", controller.flutterwaveWebhook);

router.use(authenticate);

router.get("/", requirePermission("payment:read"), controller.list);

router.get("/:id", requirePermission("payment:read"), controller.getOne);

router.post(
  "/initialize",
  requirePermission("payment:manage"),
  controller.initialize
);

router.post("/verify", requirePermission("payment:manage"), controller.verify);

export default router;
