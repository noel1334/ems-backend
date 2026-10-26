import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import { requirePermission } from "../../middleware/permission.middleware.js";

import asyncHandler from "../../common/utils/asyncHandler.js";

import {
  componentSchema,
  componentUpdateSchema,
  employeeSalarySchema,
  listSchema,
  payrollPeriodSchema,
  payrollPayoutExecutionSchema,
  salaryListSchema,
  salaryStatusSchema,
  structureSchema,
  structureUpdateSchema,
  validate,
} from "./payroll.validators.js";

import * as controller from "./payroll.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/payouts/config",
  requirePermission("payroll", "runs", "READ"),
  asyncHandler(controller.getPayoutConfiguration)
);

/*
                  |--------------------------------------------------------------------------
                  | Payroll Structures
                  |--------------------------------------------------------------------------
                  */

router.get(
  "/structures",
  requirePermission("payroll", "structures", "READ"),
  validate(listSchema, "query"),
  asyncHandler(controller.listPayrollStructures)
);

router.post(
  "/structures",
  requirePermission("payroll", "structures", "CREATE"),
  validate(structureSchema),
  asyncHandler(controller.createPayrollStructure)
);

router.patch(
  "/structures/:id",
  requirePermission("payroll", "structures", "UPDATE"),
  validate(structureUpdateSchema),
  asyncHandler(controller.updatePayrollStructure)
);

// DELETE is a permanent delete only when the structure has no salary history.
router.delete(
  "/structures/:id",
  requirePermission("payroll", "structures", "DELETE"),
  asyncHandler(controller.deletePayrollStructure)
);

router.post(
  "/structures/:structureId/components",
  requirePermission("payroll", "structures", "UPDATE"),
  validate(componentSchema),
  asyncHandler(controller.createComponent)
);

router.patch(
  "/structures/:structureId/components/:componentId",
  requirePermission("payroll", "structures", "UPDATE"),
  validate(componentUpdateSchema),
  asyncHandler(controller.updateComponent)
);

// Keep component history: DELETE deactivates rather than physically removing a row.
router.delete(
  "/structures/:structureId/components/:componentId",
  requirePermission("payroll", "structures", "UPDATE"),
  asyncHandler(controller.deleteComponent)
);

/*
                                                                                                                                                      |--------------------------------------------------------------------------
                                                                                                                                                      | Employee Salaries
                                                                                                                                                      |--------------------------------------------------------------------------
                                                                                                                                                      */

router.get(
  "/salaries",
  requirePermission("payroll", "salaries", "READ"),
  validate(salaryListSchema, "query"),
  asyncHandler(controller.listSalaries)
);

router.patch(
  "/salaries/:id/status",
  requirePermission("payroll", "salaries", "UPDATE"),
  validate(salaryStatusSchema),
  asyncHandler(controller.setSalaryStatus)
);

router.post(
  "/salaries",
  requirePermission("payroll", "salaries", "CREATE"),
  validate(employeeSalarySchema),
  asyncHandler(controller.createSalary)
);

/*
                                                                                                                                                                            |--------------------------------------------------------------------------
                                                                                                                                                                            | Payroll Periods
                                                                                                                                                                            |--------------------------------------------------------------------------
                                                                                                                                                                            */

router.get(
  "/periods",
  requirePermission("payroll", "runs", "READ"),
  validate(listSchema, "query"),
  asyncHandler(controller.listPayrollPeriods)
);

router.post(
  "/periods",
  requirePermission("payroll", "runs", "CREATE"),
  validate(payrollPeriodSchema),
  asyncHandler(controller.createPayrollPeriod)
);

router.post(
  "/periods/:id/reopen-for-correction",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.reopenForCorrection)
);

router.get(
  "/periods/:id/disbursements",
  requirePermission("payroll", "runs", "READ"),
  asyncHandler(controller.listDisbursements)
);

router.post(
  "/periods/:id/disbursements/prepare",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.prepareDisbursements)
);

// Real-money payout initiation is feature-flagged on the server and requires explicit confirmation.
router.post(
  "/periods/:id/disbursements/execute",
  requirePermission("payroll", "runs", "APPROVE"),
  validate(payrollPayoutExecutionSchema),
  asyncHandler(controller.executeDisbursementPayouts)
);

router.post(
  "/disbursements/:disbursementId/verify",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.verifyDisbursementPayout)
);

router.patch(
  "/disbursements/:disbursementId/status",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.updateDisbursement)
);

router.get(
  "/periods/:id",
  requirePermission("payroll", "runs", "READ"),
  asyncHandler(controller.getPayrollPeriod)
);

/*
                                                                                                                                                                                                                                                              |--------------------------------------------------------------------------
                                                                                                                                                                                                                                                              | Payroll Processing
                                                                                                                                                                                                                                                              |--------------------------------------------------------------------------
                                                                                                                                                                                                                                                              */

router.post(
  "/periods/:id/calculate",
  requirePermission("payroll", "runs", "UPDATE"),
  asyncHandler(controller.calculate)
);

router.post(
  "/periods/:id/approve",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.approve)
);

router.post(
  "/periods/:id/finalize",
  requirePermission("payroll", "runs", "APPROVE"),
  asyncHandler(controller.finalize)
);

/*
                                                                                                                                                                                                                                                                                                                          |--------------------------------------------------------------------------
                                                                                                                                                                                                                                                                                                                          | Employee Payroll History
                                                                                                                                                                                                                                                                                                                          |--------------------------------------------------------------------------
                                                                                                                                                                                                                                                                                                                          */

router.get(
  "/employees/:employeeId/history",
  requirePermission("payroll", "payslips", "READ"),
  asyncHandler(controller.employeeHistory)
);

export default router;
