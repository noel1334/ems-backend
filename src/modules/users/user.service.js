import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";
import { hashPassword } from "../../common/utils/crypto.js";
import {
    createUser,
    createManyUserRoles,
    deleteUser,
    deleteUserRole,
    deleteUserRoles,
    findRoleById,
    findRolesByIds,
    findUserByEmail,
    findUserByIdAndCompany,
    findUserRole,
    listUsers,
    revokeUserSessions,
    updateUser
} from "./user.repository.js";

const validateRoles = async (
    roleIds,
    companyId,
    tx
) => {
    if (!roleIds?.length) {
        return [];
    }

    const roles =
        await findRolesByIds(
            roleIds,
            companyId,
            tx
        );

    if (roles.length !== roleIds.length) {
        throw new AppError(
            "One or more selected roles are invalid or unavailable",
            400,
            "INVALID_ROLES"
        );
    }

    return roles;
};

export const listUsersService =
    async ({
        companyId,
        page,
        limit,
        search,
        status
    }) => {
        const skip =
            (page - 1) * limit;

        const result =
            await listUsers({
                companyId,
                search,
                status,
                skip,
                take: limit
            });

        return {
            users: result.users,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages: Math.ceil(
                    result.total / limit
                )
            }
        };
    };

export const getUserService = async ({
    userId,
    companyId
}) => {
    const user =
        await findUserByIdAndCompany(
            userId,
            companyId
        );

    if (!user) {
        throw new AppError(
            "User not found",
            404,
            "USER_NOT_FOUND"
        );
    }

    return user;
};

export const createUserService =
    async ({
        companyId,
        email,
        password,
        firstName,
        lastName,
        middleName,
        phone,
        avatarUrl,
        roleIds
    }) => {
        return prisma.$transaction(
            async (tx) => {
                const existing =
                    await findUserByEmail(
                        email,
                        tx
                    );

                if (
                    existing &&
                    existing.companyId ===
                    companyId
                ) {
                    throw new AppError(
                        "A user with this email already exists in this company",
                        409,
                        "EMAIL_ALREADY_EXISTS"
                    );
                }

                /*
                         * We deliberately prevent assigning system roles
                                  * such as SUPER_ADMIN through ordinary company
                                           * user creation.
                                                    */
                const roles =
                    await validateRoles(
                        roleIds,
                        companyId,
                        tx
                    );

                const forbiddenSystemRole =
                    roles.find(
                        (role) =>
                            role.name ===
                            "SUPER_ADMIN" &&
                            role.scope ===
                            "SYSTEM"
                    );

                if (forbiddenSystemRole) {
                    throw new AppError(
                        "SUPER_ADMIN cannot be assigned to a company user",
                        403,
                        "SYSTEM_ROLE_PROTECTED"
                    );
                }

                const passwordHash =
                    await hashPassword(
                        password
                    );

                const user =
                    await createUser(
                        {
                            companyId,
                            email:
                                email.toLowerCase(),
                            passwordHash,
                            firstName,
                            lastName,
                            middleName,
                            phone,
                            avatarUrl,
                            status: "ACTIVE",
                            emailVerified: false
                        },
                        tx
                    );

                if (roles.length) {
                    await createManyUserRoles(
                        roles.map((role) => ({
                            userId: user.id,
                            roleId: role.id
                        })),
                        tx
                    );
                }

                return findUserByIdAndCompany(
                    user.id,
                    companyId,
                    tx
                );
            }
        );
    };

export const updateUserService =
    async ({
        userId,
        companyId,
        data,
        currentUserId
    }) => {
        const user =
            await findUserByIdAndCompany(
                userId,
                companyId
            );

        if (!user) {
            throw new AppError(
                "User not found",
                404,
                "USER_NOT_FOUND"
            );
        }

        /*
             * Prevent an administrator from accidentally
                  * disabling/deleting the currently authenticated
                       * account through this endpoint.
                            */
        if (
            userId === currentUserId &&
            data.status &&
            data.status !== "ACTIVE"
        ) {
            throw new AppError(
                "You cannot deactivate your own account",
                400,
                "SELF_ACCOUNT_CHANGE_NOT_ALLOWED"
            );
        }

        const updated =
            await updateUser(
                userId,
                data
            );

        /*
             * If the account becomes inactive/suspended,
                  * terminate all active sessions.
                       */
        if (
            data.status &&
            data.status !== "ACTIVE"
        ) {
            await revokeUserSessions(
                userId
            );
        }

        return updated;
    };

export const assignRolesToUserService =
    async ({
        userId,
        companyId,
        roleIds
    }) => {
        const user =
            await findUserByIdAndCompany(
                userId,
                companyId
            );

        if (!user) {
            throw new AppError(
                "User not found",
                404,
                "USER_NOT_FOUND"
            );
        }

        const roles =
            await validateRoles(
                roleIds,
                companyId,
                prisma
            );

        const forbidden =
            roles.some(
                (role) =>
                    role.name ===
                    "SUPER_ADMIN" &&
                    role.scope ===
                    "SYSTEM"
            );

        if (forbidden) {
            throw new AppError(
                "SUPER_ADMIN cannot be assigned through company RBAC",
                403,
                "SYSTEM_ROLE_PROTECTED"
            );
        }

        return prisma.$transaction(
            async (tx) => {
                await deleteUserRoles(
                    userId,
                    tx
                );

                if (roles.length) {
                    await createManyUserRoles(
                        roles.map((role) => ({
                            userId,
                            roleId: role.id
                        })),
                        tx
                    );
                }

                return findUserByIdAndCompany(
                    userId,
                    companyId,
                    tx
                );
            }
        );
    };

export const removeRoleFromUserService =
    async ({
        userId,
        companyId,
        roleId
    }) => {
        const user =
            await findUserByIdAndCompany(
                userId,
                companyId
            );

        if (!user) {
            throw new AppError(
                "User not found",
                404,
                "USER_NOT_FOUND"
            );
        }

        const role =
            await findRoleById(
                roleId,
                companyId
            );

        if (!role) {
            throw new AppError(
                "Role not found",
                404,
                "ROLE_NOT_FOUND"
            );
        }

        if (
            role.name === "SUPER_ADMIN"
        ) {
            throw new AppError(
                "System roles are protected",
                403,
                "SYSTEM_ROLE_PROTECTED"
            );
        }

        const assignment =
            await findUserRole(
                userId,
                roleId
            );

        if (!assignment) {
            throw new AppError(
                "Role is not assigned to this user",
                404,
                "USER_ROLE_NOT_FOUND"
            );
        }

        await deleteUserRole(
            userId,
            roleId
        );

        return findUserByIdAndCompany(
            userId,
            companyId
        );
    };

export const deleteUserService =
    async ({
        userId,
        companyId,
        currentUserId
    }) => {
        if (userId === currentUserId) {
            throw new AppError(
                "You cannot delete your own account",
                400,
                "SELF_DELETE_NOT_ALLOWED"
            );
        }

        const user =
            await findUserByIdAndCompany(
                userId,
                companyId
            );

        if (!user) {
            throw new AppError(
                "User not found",
                404,
                "USER_NOT_FOUND"
            );
        }

        /*
             * System/special users should not be deleted
                  * through company management.
                       */
        const isProtected =
            user.roles?.some(
                (item) =>
                    item.role?.name ===
                    "SUPER_ADMIN"
            );

        if (isProtected) {
            throw new AppError(
                "System administrator accounts are protected",
                403,
                "SYSTEM_USER_PROTECTED"
            );
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.userSession.deleteMany({
                    where: {
                        userId
                    }
                });

                await tx.auditLog.deleteMany({
                    where: {
                        userId
                    }
                });

                await tx.userRole.deleteMany({
                    where: {
                        userId
                    }
                });

                await deleteUser(
                    userId,
                    tx
                );
            }
        );

        return {
            deleted: true
        };
    };