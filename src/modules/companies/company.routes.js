import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requireSuperAdmin } from "../../middleware/super-admin.middleware.js";
import { createCompany, getCompany, updateCompany } from "./company.controller.js";

const router = Router();

// Tenant creation is a platform operation. Normal company users cannot create tenants.
router.post("/", authMiddleware, requireSuperAdmin, createCompany);
router.get("/me", authMiddleware, tenantMiddleware, getCompany);
router.patch("/me", authMiddleware, tenantMiddleware, updateCompany);

export default router;
