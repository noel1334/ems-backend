import { mapCompany } from "../companies/company.mapper.js";

export const mapAuthUser = (user) => {
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
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles:
      user.roles?.map((userRole) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        scope: userRole.role.scope,
        isSystem: userRole.role.isSystem,
      })) ?? [],
  };
};

export const mapAuthSession = (session) => {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
  };
};

export const mapAuthResponse = ({ user, company, session }) => ({
  user: mapAuthUser(user),
  company: mapCompany(company),
  session: mapAuthSession(session),
});
