import { AppError } from "../../common/errors/AppError.js";
import {
    assignRolesToUserService,
    createUserService,
    deleteUserService,
    getUserService,
    listUsersService,
    removeRoleFromUserService,
    updateUserService
} from "./user.service.js";
import {
    assignRolesSchema,
    createUserSchema,
    updateUserSchema,
    userListQuerySchema
} from "./user.validation.js";
import {
    mapUser,
    mapUserList
} from "./user.mapper.js";

export const listUsers = async (
    req,
    res
) => {
    const parsed =
        userListQuerySchema.safeParse(
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
        await listUsersService({
            companyId: req.tenant.id,
            ...parsed.data
        });

    return res.status(200).json({
        success: true,
        data: {
            users: mapUserList(
                result.users
            ),
            pagination:
                result.pagination
        }
    });
};

export const getUser = async (
    req,
    res
) => {
    const user =
        await getUserService({
            userId: req.params.id,
            companyId: req.tenant.id
        });

    return res.status(200).json({
        success: true,
        data: {
            user: mapUser(user)
        }
    });
};

export const createUser = async (
    req,
    res
) => {
    const parsed =
        createUserSchema.safeParse(
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

    const user =
        await createUserService({
            companyId: req.tenant.id,
            ...parsed.data
        });

    return res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
            user: mapUser(user)
        }
    });
};

export const updateUser = async (
    req,
    res
) => {
    const parsed =
        updateUserSchema.safeParse(
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

    const user =
        await updateUserService({
            userId: req.params.id,
            companyId: req.tenant.id,
            currentUserId:
                req.user.userId,
            data: parsed.data
        });

    return res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: {
            user: mapUser(user)
        }
    });
};

export const assignRolesToUser =
    async (req, res) => {
        const parsed =
            assignRolesSchema.safeParse(
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

        const user =
            await assignRolesToUserService({
                userId: req.params.id,
                companyId: req.tenant.id,
                roleIds: parsed.data.roleIds
            });

        return res.status(200).json({
            success: true,
            message:
                "User roles updated successfully",
            data: {
                user: mapUser(user)
            }
        });
    };

export const removeRoleFromUser =
    async (req, res) => {
        const user =
            await removeRoleFromUserService({
                userId: req.params.id,
                companyId: req.tenant.id,
                roleId: req.params.roleId
            });

        return res.status(200).json({
            success: true,
            message:
                "Role removed from user successfully",
            data: {
                user: mapUser(user)
            }
        });
    };

export const deleteUser = async (
    req,
    res
) => {
    await deleteUserService({
        userId: req.params.id,
        companyId: req.tenant.id,
        currentUserId:
            req.user.userId
    });

    return res.status(200).json({
        success: true,
        message:
            "User deleted successfully"
    });
};