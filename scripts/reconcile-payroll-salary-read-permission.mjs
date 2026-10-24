import prisma from "../src/config/database.js";
import { reconcilePayrollSalaryPermissions } from "../src/bootstrap/payroll-salary-permission-bootstrap.js";

try {
  await reconcilePayrollSalaryPermissions();
} catch (error) {
  console.error("Payroll salary permission reconciliation failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
