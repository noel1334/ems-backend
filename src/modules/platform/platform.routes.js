import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../../middleware/super-admin.middleware.js";
import * as controller from "./platform.controller.js";
import * as templateController from "./role-template.controller.js";
import * as workforceController from "./platform.workforce.controller.js";
import * as resourcesController from "./platform.resources.controller.js";

const router = Router();
router.use(authenticate, requireSuperAdmin);
router.get("/role-templates", templateController.list);
router.post("/role-templates", templateController.create);
router.post("/role-templates/:id/versions", templateController.publish);
router.get("/tenants", controller.tenants);
// Platform-owner CRUD is kept separate from company routes and always uses an
// explicit tenant id in the URL. Do not remove requireSuperAdmin above.
router.get("/tenants/:id/employees", resourcesController.listTenantEmployees);
router.post("/tenants/:id/employees", resourcesController.createTenantEmployee);
router.get("/tenants/:id/employees/:employeeId", resourcesController.getTenantEmployee);
router.patch("/tenants/:id/employees/:employeeId", resourcesController.updateTenantEmployee);
router.delete("/tenants/:id/employees/:employeeId", resourcesController.deleteTenantEmployee);
router.get("/tenants/:id/departments", resourcesController.listTenantDepartmentsCrud);
router.post("/tenants/:id/departments", resourcesController.createTenantDepartment);
router.get("/tenants/:id/departments/:departmentId", resourcesController.getTenantDepartment);
router.patch("/tenants/:id/departments/:departmentId", resourcesController.updateTenantDepartment);
router.delete("/tenants/:id/departments/:departmentId", resourcesController.deleteTenantDepartment);
router.get("/tenants/:id/designations", resourcesController.listTenantDesignationsCrud);
router.post("/tenants/:id/designations", resourcesController.createTenantDesignation);
router.get("/tenants/:id/designations/:designationId", resourcesController.getTenantDesignation);
router.patch("/tenants/:id/designations/:designationId", resourcesController.updateTenantDesignation);
router.delete("/tenants/:id/designations/:designationId", resourcesController.deleteTenantDesignation);
router.post("/tenants", controller.create);
router.get("/permissions", controller.permissionCatalog);
router.get("/tenants/:id/roles", controller.tenantRoles);
router.post("/tenants/:id/roles", controller.createTenantRole);
router.patch("/tenants/:id/roles/:roleId", controller.updateTenantRole);
router.get("/tenants/:id/users", controller.tenantUsers);
router.post("/tenants/:id/users", controller.createTenantUser);
router.patch("/tenants/:id/users/:userId", controller.updateTenantUser);
router.put("/tenants/:id/users/:userId/roles", controller.assignTenantUserRoles);
router.get("/tenants/:id", controller.tenant);
router.patch("/tenants/:id", controller.update);
router.get("/audit", controller.audit);

// Workforce calendar platform endpoints (all protected by requireSuperAdmin above).
router.get("/tenants/:id/shifts", workforceController.listShifts);
router.post("/tenants/:id/shifts", workforceController.createShift);
router.get("/tenants/:id/shifts/:resourceId", workforceController.getShift);
router.patch("/tenants/:id/shifts/:resourceId", workforceController.updateShift);
router.delete("/tenants/:id/shifts/:resourceId", workforceController.deleteShift);
router.post("/tenants/:id/shifts/:resourceId/breaks", workforceController.addShiftBreak);
router.patch("/tenants/:id/shifts/:resourceId/breaks/:breakId", workforceController.updateShiftBreak);
router.delete("/tenants/:id/shifts/:resourceId/breaks/:breakId", workforceController.deleteShiftBreak);

router.get("/tenants/:id/schedules", workforceController.listSchedules);
router.post("/tenants/:id/schedules", workforceController.createSchedule);
router.get("/tenants/:id/schedules/employees/:employeeId/shifts", workforceController.getEmployeeShifts);
router.post("/tenants/:id/schedules/employees/:employeeId/shifts", workforceController.assignEmployeeShift);
router.get("/tenants/:id/schedules/employees/:employeeId", workforceController.getEmployeeSchedules);
router.post("/tenants/:id/schedules/employees/:employeeId", workforceController.assignEmployeeSchedule);
router.get("/tenants/:id/schedules/:resourceId", workforceController.getSchedule);
router.patch("/tenants/:id/schedules/:resourceId", workforceController.updateSchedule);
router.put("/tenants/:id/schedules/:resourceId/days", workforceController.replaceScheduleDays);
router.delete("/tenants/:id/schedules/:resourceId", workforceController.deleteSchedule);

router.get("/tenants/:id/holidays", workforceController.listHolidays);
router.post("/tenants/:id/holidays", workforceController.createHoliday);
router.get("/tenants/:id/holidays/:resourceId", workforceController.getHoliday);
router.patch("/tenants/:id/holidays/:resourceId", workforceController.updateHoliday);
router.delete("/tenants/:id/holidays/:resourceId", workforceController.deleteHoliday);

router.get("/tenants/:id/scheduling/generations", workforceController.listGenerations);
router.get("/tenants/:id/scheduling/generations/:generationId", workforceController.getGeneration);

export default router;
