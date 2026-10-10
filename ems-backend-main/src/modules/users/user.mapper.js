const mapRole = (role) => {
    if (!role) {
        return null;
    }

    return {
        id: role.id,
        name: role.name,
        description: role.description,
        scope: role.scope,
        isSystem: role.isSystem,
        isActive: role.isActive
    };
};

export const mapUser = (user) => {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        status: user.status,
        emailVerified: user.emailVerified,
        emailVerifiedAt:
            user.emailVerifiedAt,
        lastLoginAt: user.lastLoginAt,
        roles:
            user.roles?.map((item) =>
                mapRole(item.role)
            ) ?? [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};

export const mapUserList = (users) =>
    users.map(mapUser);
