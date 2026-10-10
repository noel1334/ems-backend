import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../../middleware/super-admin.middleware.js";
import * as controller from "./platform.controller.js";

const router = Router();
router.use(authenticate, requireSuperAdmin);
router.get("/tenants", controller.tenants);
router.post("/tenants", controller.create);
router.get("/tenants/:id/roles", controller.tenantRoles);
router.get("/tenants/:id/users", controller.tenantUsers);
router.post("/tenants/:id/users", controller.createTenantUser);
router.patch("/tenants/:id/users/:userId", controller.updateTenantUser);
router.get("/tenants/:id", controller.tenant);
router.patch("/tenants/:id", controller.update);
router.get("/audit", controller.audit);
export default router;
