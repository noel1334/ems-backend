import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { AppError } from "../../common/errors/AppError.js";

import {
    createDesignationSchema,
    updateDesignationSchema,
    designationListQuerySchema
} from "./designation.validation.js";

import {
    createDesignationService,
    getDesignationService,
    listDesignationService,
    updateDesignationService,
    deleteDesignationService
} from "./designation.service.js";

export const createDesignation =
    asyncHandler(async (req, res) => {
        const parsed =
            createDesignationSchema.safeParse(
                req.body
            );

        if (!parsed.success) {
            throw new AppError(
                "Validation failed",
                400,
                "VALIDATION_ERROR",
                parsed.error.flatten()
            );
        }

        const designation =
            await createDesignationService({
                companyId: req.tenant.id,
                data: parsed.data
            });

        return res.status(201).json({
            success: true,
            message:
                "Designation created successfully",
            data: designation
        });
    });

export const getDesignation =
    asyncHandler(async (req, res) => {
        const designation =
            await getDesignationService({
                companyId: req.tenant.id,
                designationId: req.params.id
            });

        return res.status(200).json({
            success: true,
            data: designation
        });
    });

export const listDesignations =
    asyncHandler(async (req, res) => {
        const parsed =
            designationListQuerySchema.safeParse(
                req.query
            );

        if (!parsed.success) {
            throw new AppError(
                "Invalid query parameters",
                400,
                "VALIDATION_ERROR",
                parsed.error.flatten()
            );
        }

        const result =
            await listDesignationService({
                companyId: req.tenant.id,
                query: parsed.data
            });

        return res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    });

export const updateDesignation =
    asyncHandler(async (req, res) => {
        const parsed =
            updateDesignationSchema.safeParse(
                req.body
            );

        if (!parsed.success) {
            throw new AppError(
                "Validation failed",
                400,
                "VALIDATION_ERROR",
                parsed.error.flatten()
            );
        }

        const designation =
            await updateDesignationService({
                companyId: req.tenant.id,
                designationId: req.params.id,
                data: parsed.data
            });

        return res.status(200).json({
            success: true,
            message:
                "Designation updated successfully",
            data: designation
        });
    });

export const deleteDesignation =
    asyncHandler(async (req, res) => {
        const result =
            await deleteDesignationService({
                companyId: req.tenant.id,
                designationId: req.params.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Designation deleted successfully",
            data: result
        });
    });