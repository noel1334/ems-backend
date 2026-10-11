export const mapPermission = (
    permission
) => {
    if (!permission) {
        return null;
    }

    return {
        id: permission.id,
        module: permission.module,
        resource: permission.resource,
        action: permission.action,
        description:
            permission.description,
        isActive: permission.isActive,
        createdAt:
            permission.createdAt,
        updatedAt:
            permission.updatedAt
    };
};

export const mapRole = (role) => {
    if (!role) {
        return null;
    }

    return {
        id: role.id,
        companyId: role.companyId,
        name: role.name,
        description: role.description,
        scope: role.scope,
        isSystem: role.isSystem,
        isActive: role.isActive,
        permissions:
            role.permissions?.map(
                (item) =>
                    mapPermission(
                        item.permission
                    )
            ) ?? [],
        createdAt: role.createdAt,
        updatedAt: role.updatedAt
    };
};

export const mapRoleList = (roles) =>
    roles.map(mapRole);
