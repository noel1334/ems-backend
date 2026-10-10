import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
    activateRoleService,
    createRoleService,
    deactivateRoleService,
    getRoleService,
    getRoleUsersService,
    listPermissionsService,
    listRolesService,
    updateRoleService
} from "./rbac.service.js";
import {
    createRoleSchema,
    roleListQuerySchema,
    updateRoleSchema
} from "./rbac.validation.js";
import {
    mapPermission,
    mapRole,
    mapRoleList
} from "./rbac.mapper.js";

const permissionQuerySchema =
    z.object({
        page: z.coerce
            .number()
            .int()
            .min(1)
            .default(1),

        limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(50),

        module: z
            .string()
            .trim()
            .max(100)
            .optional(),

        action: z
            .enum([
                "CREATE",
                "READ",
                "UPDATE",
                "DELETE",
                "APPROVE",
                "EXPORT",
                "MANAGE"
            ])
            .optional(),

        search: z
            .string()
            .trim()
            .max(100)
            .optional()
    });

export const listRoles = async (
    req,
    res
) => {
    const parsed =
        roleListQuerySchema.safeParse(
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
        await listRolesService({
            companyId: req.tenant.id,
            ...parsed.data
        });

    return res.status(200).json({
        success: true,
        data: {
            roles: mapRoleList(
                result.roles
            ),
            pagination:
                result.pagination
        }
    });
};

export const getRole = async (
    req,
    res
) => {
    const role =
        await getRoleService({
            roleId: req.params.id,
            companyId: req.tenant.id
        });

    return res.status(200).json({
        success: true,
        data: {
            role: mapRole(role)
        }
    });
};

export const createRole = async (
    req,
    res
) => {
    const parsed =
        createRoleSchema.safeParse(
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

    const role =
        await createRoleService({
            companyId: req.tenant.id,
            ...parsed.data
        });

    return res.status(201).json({
        success: true,
        message:
            "Role created successfully",
        data: {
            role: mapRole(role)
        }
    });
};

export const updateRole = async (
    req,
    res
) => {
    const parsed =
        updateRoleSchema.safeParse(
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

    const role =
        await updateRoleService({
            roleId: req.params.id,
            companyId: req.tenant.id,
            data: parsed.data
        });

    return res.status(200).json({
        success: true,
        message:
            "Role updated successfully",
        data: {
            role: mapRole(role)
        }
    });
};

export const activateRole = async (
    req,
    res
) => {
    const role =
        await activateRoleService({
            roleId: req.params.id,
            companyId: req.tenant.id
        });

    return res.status(200).json({
        success: true,
        message:
            "Role activated successfully",
        data: {
            role: mapRole(role)
        }
    });
};

export const deactivateRole =
    async (req, res) => {
        const role =
            await deactivateRoleService({
                roleId: req.params.id,
                companyId:
                    req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Role deactivated successfully",
            data: {
                role: mapRole(role)
            }
        });
    };

export const listPermissions =
    async (req, res) => {
        const parsed =
            permissionQuerySchema.safeParse(
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
            await listPermissionsService(
                parsed.data
            );

        return res.status(200).json({
            success: true,
            data: {
                permissions:
                    result.permissions.map(
                        mapPermission
                    ),
                pagination:
                    result.pagination
            }
        });
    };

export const getRoleUsers =
    async (req, res) => {
        const users =
            await getRoleUsersService({
                roleId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            data: {
                users
            }
        });
    };