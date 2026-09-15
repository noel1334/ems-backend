import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import companyRoutes from "../modules/companies/company.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import rbacRoutes from "../modules/rbac/rbac.routes.js";

import departmentRoutes from "../modules/departments/department.routes.js";
import designationRoutes from "../modules/designations/designation.routes.js";

import employeeProfileRoutes from "../modules/employees/employee-profile.routes.js";
import employeeRoutes from "../modules/employees/employee.routes.js";

import shiftRoutes from "../modules/shifts/shift.routes.js";
import scheduleRoutes from "../modules/schedules/schedule.routes.js";
import holidayRoutes from "../modules/holidays/holiday.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import leaveRoutes from "../modules/leave/leave.routes.js";
import payrollRoutes from "../modules/payroll/payroll.routes.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

router.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "EMS API is healthy",
  });
});

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use("/auth", authRoutes);

/*
|--------------------------------------------------------------------------
| COMPANY / USER / RBAC
|--------------------------------------------------------------------------
*/

router.use("/companies", companyRoutes);

router.use("/users", userRoutes);

router.use("/rbac", rbacRoutes);

/*
|--------------------------------------------------------------------------
| ORGANIZATION
|--------------------------------------------------------------------------
*/

router.use("/departments", departmentRoutes);

router.use("/designations", designationRoutes);

/*
|--------------------------------------------------------------------------
| EMPLOYEES
|--------------------------------------------------------------------------
*/

router.use("/employees", employeeProfileRoutes);

router.use("/employees", employeeRoutes);

/*
|--------------------------------------------------------------------------
| STAGE 9
|--------------------------------------------------------------------------
*/

router.use("/shifts", shiftRoutes);

router.use("/schedules", scheduleRoutes);

router.use("/holidays", holidayRoutes);
router.use("/attendance", attendanceRoutes);

router.use("/leave", leaveRoutes);
router.use("/payroll", payrollRoutes);

export default router;
