import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";
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

const validatePermissions = async (
    permissionIds,
    tx
) => {
    if (!permissionIds?.length) {
        return [];
    }

    const permissions =
        await findPermissionsByIds(
            permissionIds,
            tx
        );

    if (
        permissions.length !==
        permissionIds.length
    ) {
        throw new AppError(
            "One or more permissions are invalid or inactive",
            400,
            "INVALID_PERMISSIONS"
        );
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
        permissionIds
    }) => {
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
                prisma
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

                return findRoleById(
                    role.id,
                    companyId,
                    tx
                );
            }
        );
    };

export const updateRoleService =
    async ({
        roleId,
        companyId,
        data
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

        if (
            data.name &&
            data.name !== role.name
        ) {
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
                            tx
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

                return findRoleById(
                    roleId,
                    companyId,
                    tx
                );
            }
        );
    };

export const listPermissionsService =
    async ({
        module,
        action,
        search,
        page,
        limit
    }) => {
        const result =
            await listPermissions({
                module,
                action,
                search,
                page,
                limit
            });

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

export const deactivateRoleService =
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

        if (role.isSystem) {
            throw new AppError(
                "System roles cannot be deactivated",
                403,
                "SYSTEM_ROLE_PROTECTED"
            );
        }

        return updateRole(
            roleId,
            {
                isActive: false
            }
        );
    };

export const activateRoleService =
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

        if (role.isSystem) {
            throw new AppError(
                "System roles cannot be changed",
                403,
                "SYSTEM_ROLE_PROTECTED"
            );
        }

        return updateRole(
            roleId,
            {
                isActive: true
            }
        );
    };

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
            roleId
        );
    }; 