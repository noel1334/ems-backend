import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import companyRoutes from "../modules/companies/company.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import rbacRoutes from "../modules/rbac/rbac.routes.js";

import departmentRoutes from "../modules/departments/department.routes.js";
import designationRoutes from "../modules/designations/designation.routes.js";

import employeeRoutes from "../modules/employees/employee.routes.js";
import employeeProfileRoutes from "../modules/employees/employee-profile.routes.js";

import shiftRoutes from "../modules/shifts/shift.routes.js";
import scheduleRoutes from "../modules/schedules/schedule.routes.js";
import holidayRoutes from "../modules/holidays/holiday.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import leaveRoutes from "../modules/leave/leave.routes.js";
import payrollRoutes from "../modules/payroll/payroll.routes.js";
import walletRoutes from "../modules/wallet/wallet.routes.js";
import paymentRoutes from "../modules/payments/payment.routes.js";
import biometricRoutes from "../modules/biometrics/biometric.routes.js";
import attendanceDeviceRoutes from "../modules/attendance-devices/device.routes.js";
import attendanceEngineRoutes from "../modules/attendance-engine/attendance-engine.routes.js";
import selfServiceRoutes from "../modules/self-service/self-service.routes.js";
import sessionRoutes from "../sessions/session.routes.js";
import schedulingRoutes from "../modules/scheduling/scheduling.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import notificationRoutes from "../modules/notifications/notification.routes.js";
import reportRoutes from "../modules/reports/report.routes.js";
import auditRoutes from "../modules/audit/audit.routes.js";
import prisma from "../config/database.js";

const router = Router();
const openapi = { openapi: "3.0.3", info: { title: "EMS API", version: "1.0.0" }, servers: [{ url: "/api/v1" }], paths: {
  "/health": { get: { summary: "Health check", responses: { "200": { description: "Healthy" } } } },
  "/ready": { get: { summary: "Readiness check", responses: { "200": { description: "Database ready" } } } },
  "/auth/login": { post: { summary: "Authenticate user", responses: { "200": { description: "Authenticated" }, "401": { description: "Invalid credentials" } } } },
  "/auth/refresh": { post: { summary: "Rotate refresh token", responses: { "200": { description: "Token pair rotated" } } } },
  "/auth/logout": { post: { summary: "Logout current session", responses: { "200": { description: "Logged out" } } } },
  "/auth/password-reset/request": { post: { summary: "Request password reset", responses: { "200": { description: "Accepted" } } } },
  "/auth/password-reset/confirm": { post: { summary: "Reset password", responses: { "200": { description: "Password reset" } } } },
  "/auth/email/verify": { post: { summary: "Verify email", responses: { "200": { description: "Verified" } } } },
  "/payments/webhooks/paystack": { post: { summary: "Paystack webhook", responses: { "200": { description: "Received" } } } },
  "/payments/webhooks/flutterwave": { post: { summary: "Flutterwave webhook", responses: { "200": { description: "Received" } } } },
  "/biometrics/verify-and-attend": { post: { summary: "Verify biometric and record attendance", responses: { "200": { description: "Attendance recorded" } } } }
} };


/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

router.get("/docs/openapi.json", (req, res) => res.json(openapi));

router.get("/health", (req, res) => {
  return res.status(200).json({ success: true, message: "EMS API is healthy", requestId: req.requestId });
});

router.get("/ready", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ success: true, message: "EMS API is ready", requestId: req.requestId });
  } catch (error) {
    return next(error);
  }
});

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use("/auth", authRoutes);
router.use("/sessions", sessionRoutes);

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


router.use("/employees", employeeRoutes);
router.use("/employees", employeeProfileRoutes);

/*
|--------------------------------------------------------------------------
| STAGE 9
|--------------------------------------------------------------------------
*/

router.use("/shifts", shiftRoutes);

router.use("/schedules", scheduleRoutes);
router.use("/scheduling", schedulingRoutes);

router.use("/holidays", holidayRoutes);
router.use("/attendance", attendanceRoutes);

router.use("/leave", leaveRoutes);
router.use("/payroll", payrollRoutes);
router.use("/wallet", walletRoutes);
router.use("/payments", paymentRoutes);
router.use("/biometrics", biometricRoutes);
router.use("/attendance-devices", attendanceDeviceRoutes);
router.use("/attendance-engine", attendanceEngineRoutes);
router.use("/me", selfServiceRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/reports", reportRoutes);
router.use("/audit-logs", auditRoutes);

export default router;
