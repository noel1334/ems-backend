export const mapCompany = (company) => {
    if (!company) {
        return null;
    }

    return {
        id: company.id,
        name: company.name,
        legalName: company.legalName,
        slug: company.slug,
        email: company.email,
        phone: company.phone,
        address: company.address,
        city: company.city,
        state: company.state,
        country: company.country,
        timezone: company.timezone,
        currency: company.currency,
        status: company.status,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt
    };
};

export const mapRole = (role) => {
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
        emailVerifiedAt: user.emailVerifiedAt,
        failedLoginCount: user.failedLoginCount,
        lockedUntil: user.lockedUntil,
        lastLoginAt: user.lastLoginAt,
        roles:
            user.roles?.map((userRole) =>
                mapRole(userRole.role)
            ) ?? [],
        company: mapCompany(user.company),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};

export const mapSession = (session) => {
    if (!session) {
        return null;
    }

    return {
        id: session.id,
        userId: session.userId,
        companyId: session.companyId,
        status: session.status,
        deviceName: session.deviceName,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        expiresAt: session.expiresAt,
        lastUsedAt: session.lastUsedAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
    };
};
