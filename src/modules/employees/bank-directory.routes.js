import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import asyncHandler from "../../common/utils/asyncHandler.js";
import { listBankDirectory, resolveBankAccount } from "./bank-directory.service.js";

const router = Router();
router.use(authMiddleware, tenantMiddleware);
router.get("/", requirePermission("employees", "employee-profile", "READ"), asyncHandler(async (_req, res) => {
  const data = await listBankDirectory();
  return res.status(200).json({ success: true, message: "Bank directory loaded", data });
}));
router.post("/resolve", requirePermission("employees", "employee-profile", "UPDATE"), asyncHandler(async (req, res) => {
  const data = await resolveBankAccount(req.body || {});
  return res.status(200).json({ success: true, message: "Bank account resolved", data });
}));
export default router;
