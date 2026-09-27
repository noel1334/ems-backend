import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import { requirePermission } from "../../middleware/permission.middleware.js";

import asyncHandler from "../../common/utils/asyncHandler.js";

import {
  componentSchema,
  employeeSalarySchema,
  listSchema,
  payrollPeriodSchema,
  structureSchema,
  structureUpdateSchema,
  validate,
} from "./payroll.validators.js";

import * as controller from "./payroll.controller.js";

const router = Router();

router.use(authenticate);

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

/*
                                                                                                                                                      |--------------------------------------------------------------------------
                                                                                                                                                      | Employee Salaries
                                                                                                                                                      |--------------------------------------------------------------------------
                                                                                                                                                      */

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
