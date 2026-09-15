import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import { validateBody, validateQuery } from "../../common/validators/zod.js";
import {
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
  leaveRequestCreateSchema,
  leaveRequestUpdateSchema,
  approvalSchema,
  rejectionSchema,
  balanceInitializeSchema,
  balanceAdjustmentSchema,
  typeListSchema,
  balanceListSchema,
  requestListSchema,
} from "./leave.validators.js";
import * as c from "./leave.controller.js";
const router = Router();
router.use(authenticate);
router.get(
  "/reports/summary",
  requirePermission("leave", "reports", "READ"),
  c.reportSummary
);
router.get(
  "/types",
  requirePermission("leave", "types", "READ"),
  validateQuery(typeListSchema),
  c.listTypes
);
router.post(
  "/types",
  requirePermission("leave", "types", "CREATE"),
  validateBody(leaveTypeCreateSchema),
  c.createType
);
router.get(
  "/types/:id",
  requirePermission("leave", "types", "READ"),
  c.getType
);
router.patch(
  "/types/:id",
  requirePermission("leave", "types", "UPDATE"),
  validateBody(leaveTypeUpdateSchema),
  c.updateType
);
router.delete(
  "/types/:id",
  requirePermission("leave", "types", "DELETE"),
  c.deleteType
);
router.get(
  "/balances",
  requirePermission("leave", "entitlements", "READ"),
  validateQuery(balanceListSchema),
  c.listBalances
);
router.post(
  "/balances/initialize",
  requirePermission("leave", "entitlements", "MANAGE"),
  validateBody(balanceInitializeSchema),
  c.initializeBalance
);
router.patch(
  "/balances/:id",
  requirePermission("leave", "entitlements", "MANAGE"),
  validateBody(balanceAdjustmentSchema),
  c.adjustBalance
);
router.get(
  "/employees/:employeeId/history",
  requirePermission("leave", "requests", "READ"),
  c.employeeHistory
);
router.get(
  "/requests",
  requirePermission("leave", "requests", "READ"),
  validateQuery(requestListSchema),
  c.listRequests
);
router.post(
  "/requests",
  requirePermission("leave", "requests", "CREATE"),
  validateBody(leaveRequestCreateSchema),
  c.createRequest
);
router.get(
  "/requests/:id",
  requirePermission("leave", "requests", "READ"),
  c.getRequest
);
router.patch(
  "/requests/:id",
  requirePermission("leave", "requests", "UPDATE"),
  validateBody(leaveRequestUpdateSchema),
  c.updateRequest
);
router.post(
  "/requests/:id/cancel",
  requirePermission("leave", "requests", "UPDATE"),
  c.cancelRequest
);
router.post(
  "/requests/:id/approve",
  requirePermission("leave", "requests", "APPROVE"),
  validateBody(approvalSchema),
  c.approveRequest
);
router.post(
  "/requests/:id/reject",
  requirePermission("leave", "requests", "APPROVE"),
  validateBody(rejectionSchema),
  c.rejectRequest
);
export default router;
