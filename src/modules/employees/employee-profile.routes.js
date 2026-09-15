import { Router } from "express";

import {
    addBankAccount,
    listBankAccounts,
    updateBankAccount,
    deleteBankAccount,
    addEducation,
    listEducation,
    updateEducation,
    deleteEducation,
    addExperience,
    listExperience,
    updateExperience,
    deleteExperience,
    listDocuments,
    uploadDocument,
    deleteDocument,
    updateProfilePhoto
} from "./employee-profile.controller.js";

import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import { uploadSingle } from "../../middleware/upload.middleware.js";

const router = Router();

router.use(
    authMiddleware,
    tenantMiddleware
);

router.post(
    "/:id/bank-accounts",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    addBankAccount
);

router.get(
    "/:id/bank-accounts",
    requirePermission(
        "employees",
        "employee-profile",
        "READ"
    ),
    listBankAccounts
);

router.patch(
    "/:id/bank-accounts/:accountId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    updateBankAccount
);

router.delete(
    "/:id/bank-accounts/:accountId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    deleteBankAccount
);

router.post(
    "/:id/education",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    addEducation
);

router.get(
    "/:id/education",
    requirePermission(
        "employees",
        "employee-profile",
        "READ"
    ),
    listEducation
);

router.patch(
    "/:id/education/:educationId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    updateEducation
);

router.delete(
    "/:id/education/:educationId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    deleteEducation
);

router.post(
    "/:id/experience",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    addExperience
);

router.get(
    "/:id/experience",
    requirePermission(
        "employees",
        "employee-profile",
        "READ"
    ),
    listExperience
);

router.patch(
    "/:id/experience/:experienceId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    updateExperience
);

router.delete(
    "/:id/experience/:experienceId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    deleteExperience
);

router.get(
    "/:id/documents",
    requirePermission(
        "employees",
        "employee-profile",
        "READ"
    ),
    listDocuments
);

router.post(
    "/:id/documents",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    uploadSingle("document"),
    uploadDocument
);

router.delete(
    "/:id/documents/:documentId",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    deleteDocument
);

router.post(
    "/:id/profile-photo",
    requirePermission(
        "employees",
        "employee-profile",
        "UPDATE"
    ),
    uploadSingle("photo"),
    updateProfilePhoto
);

export default router;