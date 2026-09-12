import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { AppError } from "../../common/errors/AppError.js";
import {
    createDepartmentSchema,
    updateDepartmentSchema,
    departmentListQuerySchema
} from "./department.validation.js";
import {
    createDepartmentService,
    getDepartmentService,
    listDepartmentService,
    updateDepartmentService,
    deleteDepartmentService
} from "./department.service.js";

export const createDepartment = asyncHandler(
    async (req, res) => {
        const parsed = createDepartmentSchema.safeParse(
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

        const department =
            await createDepartmentService({
                companyId: req.tenant.id,
                data: parsed.data
            });

        return res.status(201).json({
            success: true,
            message: "Department created successfully",
            data: department
        });
    }
);

export const getDepartment = asyncHandler(
    async (req, res) => {
        const department =
            await getDepartmentService({
                companyId: req.tenant.id,
                departmentId: req.params.id
            });

        return res.status(200).json({
            success: true,
            data: department
        });
    }
);

export const listDepartments = asyncHandler(
    async (req, res) => {
        const parsed =
            departmentListQuerySchema.safeParse(
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
            await listDepartmentService({
                companyId: req.tenant.id,
                query: parsed.data
            });

        return res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    }
);

export const updateDepartment = asyncHandler(
    async (req, res) => {
        const parsed = updateDepartmentSchema.safeParse(
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

        const department =
            await updateDepartmentService({
                companyId: req.tenant.id,
                departmentId: req.params.id,
                data: parsed.data
            });

        return res.status(200).json({
            success: true,
            message: "Department updated successfully",
            data: department
        });
    }
);

export const deleteDepartment = asyncHandler(
    async (req, res) => {
        const result =
            await deleteDepartmentService({
                companyId: req.tenant.id,
                departmentId: req.params.id
            });

        return res.status(200).json({
            success: true,
            message: "Department deleted successfully",
            data: result
        });
    }
);