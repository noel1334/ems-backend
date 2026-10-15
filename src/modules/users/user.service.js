import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";
import { hashPassword } from "../../common/utils/crypto.js";
import { isTenantAssignablePermission } from "../rbac/rbac.policy.js";
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


const validateEmployeeLink = async (employeeId, companyId, userId, tx) => {
    if (!employeeId) return null;

    const employee = await tx.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true }
    });
    if (!employee) {
        throw new AppError("Selected employee was not found in this company", 404, "EMPLOYEE_NOT_FOUND");
    }

    const existingLink = await tx.user.findFirst({
        where: {
            employeeId,
            ...(userId ? { id: { not: userId } } : {})
        },
        select: { id: true }
    });
    if (existingLink) {
        throw new AppError("This employee profile is already linked to another user account", 409, "EMPLOYEE_ALREADY_LINKED");
    }

    return employeeId;
};

const validateRoles = async (
    roleIds,
    companyId,
    tx,
    actorUserId
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
            "One or more selected roles are invalid or unavailable for this company",
            400,
            "INVALID_ROLES"
        );
    }

    if (roles.some((role) => role.scope !== "COMPANY" || role.name === "SUPER_ADMIN")) {
        throw new AppError("Platform-only roles cannot be assigned to company users", 403, "SYSTEM_ROLE_PROTECTED");
    }

    if (actorUserId && roleIds.length) {
        const actor = await tx.user.findFirst({
            where: { id: actorUserId, companyId, status: "ACTIVE" },
            select: { roles: { where: { role: { isActive: true } }, select: { role: { select: { scope: true, companyId: true, permissions: { where: { permission: { isActive: true } }, select: { permissionId: true, permission: true } } } } } } },
        });
        if (!actor) throw new AppError("Active company administrator not found", 403, "ROLE_GRANT_NOT_ALLOWED");
        const allowedPermissionIds = new Set(actor.roles
            .filter(({ role }) => role.scope === "COMPANY" && role.companyId === companyId)
            .flatMap(({ role }) => role.permissions.filter(({ permission }) => isTenantAssignablePermission(permission)).map(({ permissionId }) => permissionId)));
        for (const role of roles) {
            const rolePermissionRows = await tx.rolePermission.findMany({
                where: { roleId: role.id, permission: { isActive: true } },
                select: { permissionId: true, permission: true },
            });
            if (rolePermissionRows.filter(({ permission }) => isTenantAssignablePermission(permission)).some(({ permissionId }) => !allowedPermissionIds.has(permissionId))) {
                throw new AppError(`You are not allowed to assign the ${role.name} role because it grants permissions you do not hold`, 403, "ROLE_GRANT_NOT_ALLOWED");
            }
        }
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
        roleIds,
        employeeId,
        currentUserId
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
                        tx,
                        currentUserId
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

                const linkedEmployeeId = await validateEmployeeLink(employeeId, companyId, null, tx);
                const passwordHash =
                    await hashPassword(
                        password
                    );

                const user =
                    await createUser(
                        {
                            companyId,
                            employeeId: linkedEmployeeId,
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

export const updateUserService = async ({ userId, companyId, data, currentUserId }) => {
    return prisma.$transaction(async (tx) => {
        const user = await findUserByIdAndCompany(userId, companyId, tx);
        if (!user) {
            throw new AppError("User not found", 404, "USER_NOT_FOUND");
        }

        if (userId === currentUserId && data.status && data.status !== "ACTIVE") {
            throw new AppError("You cannot deactivate your own account", 400, "SELF_ACCOUNT_CHANGE_NOT_ALLOWED");
        }

        const updateData = { ...data };
        if (Object.prototype.hasOwnProperty.call(data, "employeeId")) {
            updateData.employeeId = await validateEmployeeLink(data.employeeId, companyId, userId, tx);
        }

        const updated = await updateUser(userId, updateData, tx);
        if (data.status && data.status !== "ACTIVE") {
            await revokeUserSessions(userId, tx);
        }
        return findUserByIdAndCompany(updated.id, companyId, tx);
    });
};

export const assignRolesToUserService =
    async ({
        userId,
        companyId,
        roleIds,
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

        const roles =
            await validateRoles(
                roleIds,
                companyId,
                prisma,
                currentUserId
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