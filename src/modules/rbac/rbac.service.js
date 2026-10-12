import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";
import { isTenantAssignablePermission, isReservedSystemRoleName } from "./rbac.policy.js";
import { writeAudit } from "../../common/utils/audit.js";
import {
    createRole,
    createRolePermissions,
    deleteRolePermissions,
    findCompanyRoleByName,
    findPermissionsByIds,
    findRoleById,
    findRoleUsers,
    listPermissions,
    listRoles,
    updateRole
} from "./rbac.repository.js";

const validatePermissions = async (permissionIds, tx, actorUserId, companyId) => {
    if (!permissionIds?.length) return [];
    const permissions = await findPermissionsByIds(permissionIds, tx);
    if (permissions.length !== permissionIds.length) {
        throw new AppError("One or more permissions are invalid or inactive", 400, "INVALID_PERMISSIONS");
    }
    if (permissions.some((permission) => !isTenantAssignablePermission(permission))) {
        throw new AppError("Company roles cannot be granted platform-only permissions", 403, "PLATFORM_PERMISSION_NOT_ASSIGNABLE");
    }
    if (actorUserId) {
        const actor = await tx.user.findFirst({
            where: { id: actorUserId, companyId, status: "ACTIVE" },
            select: { id: true, roles: { where: { role: { isActive: true } }, select: { role: { select: { scope: true, companyId: true, permissions: { where: { permission: { isActive: true } }, select: { permissionId: true, permission: true } } } } } } },
        });
        if (!actor) throw new AppError("Active company administrator not found", 403, "ROLE_GRANT_NOT_ALLOWED");
        const allowed = new Set(actor.roles.filter(({ role }) => role.scope === "COMPANY" && (role.companyId === null || role.companyId === companyId)).flatMap(({ role }) => role.permissions.filter(({ permission }) => isTenantAssignablePermission(permission)).map(({ permissionId }) => permissionId)));
        if (permissions.some((permission) => !allowed.has(permission.id))) {
            throw new AppError("You can only assign permissions already granted to your own roles", 403, "PERMISSION_DELEGATION_DENIED");
        }
    }
    return permissions;
};

export const listRolesService =
    async ({
        companyId,
        page,
        limit,
        search,
        scope
    }) => {
        const result =
            await listRoles({
                companyId,
                page,
                limit,
                search,
                scope
            });

        return {
            roles: result.roles,
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

export const getRoleService = async ({
    roleId,
    companyId
}) => {
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

    return role;
};

export const createRoleService =
    async ({
        companyId,
        name,
        description,
        permissionIds,
        actorUserId,
        requestId,
        ipAddress,
        userAgent
    }) => {
        if (isReservedSystemRoleName(name)) {
            throw new AppError("This name is reserved for a protected system role", 400, "RESERVED_ROLE_NAME");
        }

        const existing =
            await findCompanyRoleByName(
                name,
                companyId
            );

        if (existing) {
            throw new AppError(
                "A role with this name already exists",
                409,
                "ROLE_ALREADY_EXISTS"
            );
        }

        const permissions =
            await validatePermissions(
                permissionIds,
                prisma,
                actorUserId,
                companyId
            );

        return prisma.$transaction(
            async (tx) => {
                const role =
                    await createRole(
                        {
                            companyId,
                            name,
                            description,
                            scope: "COMPANY",
                            isSystem: false,
                            isActive: true
                        },
                        tx
                    );

                if (permissions.length) {
                    await createRolePermissions(
                        permissions.map(
                            (permission) => ({
                                roleId: role.id,
                                permissionId:
                                    permission.id
                            })
                        ),
                        tx
                    );
                }

                const result = await findRoleById(
                    role.id,
                    companyId,
                    tx
                );
                await writeAudit(tx, {
                    companyId,
                    actorUserId,
                    action: "CREATE",
                    module: "rbac",
                    resource: "role",
                    resourceId: role.id,
                    requestId,
                    ipAddress,
                    userAgent,
                    metadata: { roleName: role.name, permissionIds: permissions.map((permission) => permission.id) },
                });
                return result;
            }
        );
    };

export const updateRoleService =
    async ({
        roleId,
        companyId,
        data,
        actorUserId,
        requestId,
        ipAddress,
        userAgent
    }) => {
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

        if (role.isSystem) {
            throw new AppError(
                "System roles cannot be modified",
                403,
                "SYSTEM_ROLE_PROTECTED"
            );
        }

        if (data.name && data.name !== role.name) {
            if (isReservedSystemRoleName(data.name)) {
                throw new AppError("This name is reserved for a protected system role", 400, "RESERVED_ROLE_NAME");
            }
            const existing =
                await findCompanyRoleByName(
                    data.name,
                    companyId
                );

            if (existing) {
                throw new AppError(
                    "A role with this name already exists",
                    409,
                    "ROLE_ALREADY_EXISTS"
                );
            }
        }

        return prisma.$transaction(
            async (tx) => {
                const updateData = {};

                if (
                    data.name !== undefined
                ) {
                    updateData.name =
                        data.name;
                }

                if (
                    data.description !==
                    undefined
                ) {
                    updateData.description =
                        data.description;
                }

                if (
                    data.isActive !==
                    undefined
                ) {
                    updateData.isActive =
                        data.isActive;
                }

                await updateRole(
                    roleId,
                    updateData,
                    tx
                );

                if (
                    data.permissionIds !==
                    undefined
                ) {
                    const permissions =
                        await validatePermissions(
                            data.permissionIds,
                            tx,
                            actorUserId,
                            companyId
                        );

                    await deleteRolePermissions(
                        roleId,
                        tx
                    );

                    if (permissions.length) {
                        await createRolePermissions(
                            permissions.map(
                                (permission) => ({
                                    roleId,
                                    permissionId:
                                        permission.id
                                })
                            ),
                            tx
                        );
                    }
                }

                const updated = await findRoleById(
                    roleId,
                    companyId,
                    tx
                );
                await writeAudit(tx, {
                    companyId,
                    actorUserId,
                    action: "UPDATE",
                    module: "rbac",
                    resource: "role",
                    resourceId: roleId,
                    requestId,
                    ipAddress,
                    userAgent,
                    metadata: {
                        before: { name: role.name, isActive: role.isActive, permissionIds: (role.permissions ?? []).map((item) => item.permissionId) },
                        after: data,
                    },
                });
                return updated;
            }
        );
    };

export const listPermissionsService =
    async ({
        module,
        action,
        search,
        page,
        limit,
        companyId,
        actorUserId
    }) => {
        let permissionIds;
        if (actorUserId) {
            const actor = await prisma.user.findFirst({
                where: { id: actorUserId, companyId, status: "ACTIVE" },
                select: { roles: { where: { role: { isActive: true } }, select: { role: { select: { scope: true, companyId: true, permissions: { where: { permission: { isActive: true } }, select: { permissionId: true, permission: true } } } } } } },
            });
            if (!actor) throw new AppError("Active company administrator not found", 403, "ROLE_GRANT_NOT_ALLOWED");
            permissionIds = [...new Set(actor.roles.filter(({ role }) => role.scope === "COMPANY" && (role.companyId === null || role.companyId === companyId)).flatMap(({ role }) => role.permissions.filter(({ permission }) => isTenantAssignablePermission(permission)).map(({ permissionId }) => permissionId)))];
        }
        const result = await listPermissions({ module, action, search, page, limit, permissionIds });

        return {
            permissions:
                result.permissions,
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

export const deactivateRoleService = async ({
    roleId,
    companyId,
    actorUserId,
    requestId,
    ipAddress,
    userAgent,
}) => prisma.$transaction(async (tx) => {
    const role = await findRoleById(roleId, companyId, tx);
    if (!role) throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
    if (role.isSystem) throw new AppError("System roles cannot be deactivated", 403, "SYSTEM_ROLE_PROTECTED");
    const updated = await updateRole(roleId, { isActive: false }, tx);
    await writeAudit(tx, {
        companyId, actorUserId, action: "UPDATE", module: "rbac", resource: "role", resourceId: roleId,
        requestId, ipAddress, userAgent,
        metadata: { roleName: role.name, isActiveBefore: role.isActive, isActiveAfter: false },
    });
    return updated;
});

export const activateRoleService = async ({
    roleId,
    companyId,
    actorUserId,
    requestId,
    ipAddress,
    userAgent,
}) => prisma.$transaction(async (tx) => {
    const role = await findRoleById(roleId, companyId, tx);
    if (!role) throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
    if (role.isSystem) throw new AppError("System roles cannot be changed", 403, "SYSTEM_ROLE_PROTECTED");
    const updated = await updateRole(roleId, { isActive: true }, tx);
    await writeAudit(tx, {
        companyId, actorUserId, action: "UPDATE", module: "rbac", resource: "role", resourceId: roleId,
        requestId, ipAddress, userAgent,
        metadata: { roleName: role.name, isActiveBefore: role.isActive, isActiveAfter: true },
    });
    return updated;
});

export const getRoleUsersService =
    async ({
        roleId,
        companyId
    }) => {
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

        return findRoleUsers(
            roleId,
            companyId
        );
    };
