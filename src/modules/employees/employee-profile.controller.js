import asyncHandler from "../../common/utils/asyncHandler.js";

import {
    createBankAccountSchema,
    updateBankAccountSchema,
    createEducationSchema,
    updateEducationSchema,
    createExperienceSchema,
    updateExperienceSchema,
    createDocumentSchema
} from "./employee-profile.validation.js";

import {
    addBankAccountService,
    listBankAccountsService,
    updateBankAccountService,
    deleteBankAccountService,
    addEducationService,
    listEducationService,
    updateEducationService,
    deleteEducationService,
    addExperienceService,
    listExperienceService,
    updateExperienceService,
    deleteExperienceService,
    listDocumentsService,
    uploadDocumentService,
    deleteDocumentService,
    updateProfilePhotoService
} from "./employee-profile.service.js";

import { localStorage } from "../../common/storage/local.storage.js";

export const addBankAccount =
    asyncHandler(async (req, res) => {
        const data =
            createBankAccountSchema.parse(
                req.body
            );

        const result =
            await addBankAccountService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                data
            });

        return res.status(201).json({
            success: true,
            message:
                "Bank account added successfully",
            data: result
        });
    });

export const listBankAccounts =
    asyncHandler(async (req, res) => {
        const result =
            await listBankAccountsService({
                employeeId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Bank accounts retrieved successfully",
            data: result
        });
    });

export const updateBankAccount =
    asyncHandler(async (req, res) => {
        const data =
            updateBankAccountSchema.parse(
                req.body
            );

        const result =
            await updateBankAccountService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                accountId:
                    req.params.accountId,
                data
            });

        return res.status(200).json({
            success: true,
            message:
                "Bank account updated successfully",
            data: result
        });
    });

export const deleteBankAccount =
    asyncHandler(async (req, res) => {
        await deleteBankAccountService({
            employeeId: req.params.id,
            companyId: req.tenant.id,
            accountId:
                req.params.accountId
        });

        return res.status(200).json({
            success: true,
            message:
                "Bank account deleted successfully"
        });
    });

export const addEducation =
    asyncHandler(async (req, res) => {
        const data =
            createEducationSchema.parse(
                req.body
            );

        const result =
            await addEducationService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                data
            });

        return res.status(201).json({
            success: true,
            message:
                "Education record added successfully",
            data: result
        });
    });

export const listEducation =
    asyncHandler(async (req, res) => {
        const result =
            await listEducationService({
                employeeId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Education records retrieved successfully",
            data: result
        });
    });

export const updateEducation =
    asyncHandler(async (req, res) => {
        const data =
            updateEducationSchema.parse(
                req.body
            );

        const result =
            await updateEducationService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                educationId:
                    req.params.educationId,
                data
            });

        return res.status(200).json({
            success: true,
            message:
                "Education record updated successfully",
            data: result
        });
    });

export const deleteEducation =
    asyncHandler(async (req, res) => {
        await deleteEducationService({
            employeeId: req.params.id,
            companyId: req.tenant.id,
            educationId:
                req.params.educationId
        });

        return res.status(200).json({
            success: true,
            message:
                "Education record deleted successfully"
        });
    });

export const addExperience =
    asyncHandler(async (req, res) => {
        const data =
            createExperienceSchema.parse(
                req.body
            );

        const result =
            await addExperienceService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                data
            });

        return res.status(201).json({
            success: true,
            message:
                "Experience record added successfully",
            data: result
        });
    });

export const listExperience =
    asyncHandler(async (req, res) => {
        const result =
            await listExperienceService({
                employeeId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Experience records retrieved successfully",
            data: result
        });
    });

export const updateExperience =
    asyncHandler(async (req, res) => {
        const data =
            updateExperienceSchema.parse(
                req.body
            );

        const result =
            await updateExperienceService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                experienceId:
                    req.params.experienceId,
                data
            });

        return res.status(200).json({
            success: true,
            message:
                "Experience record updated successfully",
            data: result
        });
    });

export const deleteExperience =
    asyncHandler(async (req, res) => {
        await deleteExperienceService({
            employeeId: req.params.id,
            companyId: req.tenant.id,
            experienceId:
                req.params.experienceId
        });

        return res.status(200).json({
            success: true,
            message:
                "Experience record deleted successfully"
        });
    });

export const listDocuments =
    asyncHandler(async (req, res) => {
        const result =
            await listDocumentsService({
                employeeId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Employee documents retrieved successfully",
            data: result
        });
    });

export const uploadDocument =
    asyncHandler(async (req, res) => {
        const data =
            createDocumentSchema.parse(
                req.body
            );

        const result =
            await uploadDocumentService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                data,
                file: req.file,
                storage: localStorage
            });

        return res.status(201).json({
            success: true,
            message:
                "Employee document uploaded successfully",
            data: result
        });
    });

export const deleteDocument =
    asyncHandler(async (req, res) => {
        await deleteDocumentService({
            employeeId: req.params.id,
            companyId: req.tenant.id,
            documentId:
                req.params.documentId,
            storage: localStorage
        });

        return res.status(200).json({
            success: true,
            message:
                "Employee document deleted successfully"
        });
    });

export const updateProfilePhoto =
    asyncHandler(async (req, res) => {
        const result =
            await updateProfilePhotoService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                file: req.file,
                storage: localStorage
            });

        return res.status(200).json({
            success: true,
            message:
                "Employee profile photo updated successfully",
            data: result
        });
    });