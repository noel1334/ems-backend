import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import asyncHandler from "../../common/utils/asyncHandler.js";
import { listBankDirectory, resolveBankAccount } from "./bank-directory.service.js";
import * as monnifyService from "../payments/monnify/monnify.service.js";

const router = Router();
router.use(authMiddleware, tenantMiddleware);
router.get("/", requirePermission("employees", "employee-profile", "READ"), asyncHandler(async (_req, res) => {
  const data = await listBankDirectory();
  return res.status(200).json({ success: true, message: "Bank directory loaded", data });
}));

router.get("/monnify", requirePermission("employees", "employee-profile", "READ"), asyncHandler(async (req, res) => {
  const companyId = req.tenant?.id ?? req.user?.companyId;
  const data = await monnifyService.listBanks(companyId);
  return res.status(200).json({ success: true, message: "Monnify bank directory loaded", data });
}));
router.post("/monnify/resolve", requirePermission("employees", "employee-profile", "UPDATE"), asyncHandler(async (req, res) => {
  const companyId = req.tenant?.id ?? req.user?.companyId;
  const data = await monnifyService.resolveMonnifyAccount(companyId, req.body?.accountNumber, req.body?.bankCode);
  return res.status(200).json({ success: true, message: "Monnify beneficiary verified", data });
}));
router.post("/resolve", requirePermission("employees", "employee-profile", "UPDATE"), asyncHandler(async (req, res) => {
  const data = await resolveBankAccount(req.body || {});
  return res.status(200).json({ success: true, message: "Bank account resolved", data });
}));
export default router;
