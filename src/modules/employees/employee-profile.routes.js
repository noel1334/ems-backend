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
import asyncHandler from "../../common/utils/asyncHandler.js";
import { listBanks as listMonnifyBanks, resolveMonnifyAccount } from "../payments/monnify/monnify.service.js";

const router = Router();

router.use(
    authMiddleware,
    tenantMiddleware
);

// Company-specific Monnify directory and Name Enquiry used by employee bank details.
router.get(
    "/bank-directory/monnify",
    requirePermission("employees", "employee-profile", "READ"),
    asyncHandler(async (req, res) => {
        const data = await listMonnifyBanks(req.tenant.id);
        return res.status(200).json({ success: true, message: "Monnify bank directory loaded", data });
    })
);

router.post(
    "/bank-directory/monnify/resolve",
    requirePermission("employees", "employee-profile", "UPDATE"),
    asyncHandler(async (req, res) => {
        const data = await resolveMonnifyAccount(req.tenant.id, req.body?.accountNumber, req.body?.bankCode);
        return res.status(200).json({ success: true, message: "Monnify account verified", data });
    })
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