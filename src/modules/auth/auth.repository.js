import prisma from "../../config/database.js";

export const findUserByEmail = async (
    email,
    tx = prisma
) =>
    tx.user.findFirst({
        where: {
            email: email.toLowerCase()
        },
        include: {
            company: true,
            roles: {
                include: {
                    role: true
                }
            }
        }
    });

export const findUserById = async (
    userId,
    tx = prisma
) =>
    tx.user.findUnique({
        where: {
            id: userId
        },
        include: {
            company: true,
            roles: {
                include: {
                    role: true
                }
            }
        }
    });

export const updateUser = async (
    userId,
    data,
    tx = prisma
) =>
    tx.user.update({
        where: {
            id: userId
        },
        data,
        include: {
            company: true,
            roles: {
                include: {
                    role: true
                }
            }
        }
    });

export const findRoleByName = async (
    name,
    tx = prisma
) =>
    tx.role.findFirst({
        where: {
            name,
            isActive: true
        }
    });

export const findSessionById = async (
    sessionId,
    tx = prisma
) =>
    tx.userSession.findUnique({
        where: {
            id: sessionId
        },
        include: {
            user: {
                include: {
                    company: true,
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            },
            company: true
        }
    });

export const createSession = async (
    data,
    tx = prisma
) =>
    tx.userSession.create({
        data
    });

export const updateSession = async (
    sessionId,
    data,
    tx = prisma
) =>
    tx.userSession.update({
        where: {
            id: sessionId
        },
        data
    });

export const rotateSessionToken = async (
    sessionId,
    currentRefreshTokenHash,
    newRefreshTokenHash,
    expiresAt,
    tx = prisma
) =>
    tx.userSession.updateMany({
        where: {
            id: sessionId,
            status: "ACTIVE",
            refreshTokenHash:
                currentRefreshTokenHash
        },
        data: {
            refreshTokenHash:
                newRefreshTokenHash,
            expiresAt,
            lastUsedAt: new Date()
        }
    });

export const revokeUserSession = async (
    userId,
    sessionId,
    tx = prisma
) =>
    tx.userSession.updateMany({
        where: {
            id: sessionId,
            userId,
            status: "ACTIVE"
        },
        data: {
            status: "REVOKED",
            revokedAt: new Date()
        }
    });

export const revokeAllUserSessions = async (
    userId,
    tx = prisma
) =>
    tx.userSession.updateMany({
        where: {
            userId,
            status: "ACTIVE"
        },
        data: {
            status: "REVOKED",
            revokedAt: new Date()
        }
    });

export const findCompanyBySlug = async (
    slug,
    tx = prisma
) =>
    tx.company.findUnique({
        where: {
            slug
        }
    });

export const findCompanyByEmail = async (
    email,
    tx = prisma
) =>
    tx.company.findFirst({
        where: {
            email: email.toLowerCase()
        }
    });

export const createCompany = async (
    data,
    tx = prisma
) =>
    tx.company.create({
        data
    });

export const createUser = async (
    data,
    tx = prisma
) =>
    tx.user.create({
        data,
        include: {
            company: true,
            roles: {
                include: {
                    role: true
                }
            }
        }
    });

export const assignRoleToUser = async (
    data,
    tx = prisma
) =>
    tx.userRole.create({
        data
    });

export const createWallet = async (
    data,
    tx = prisma
) =>
    tx.wallet.create({
        data
    });

export const createAuthToken = (data, tx = prisma) => tx.authToken.create({ data });
export const findAuthToken = (tokenHash, purpose, tx = prisma) => tx.authToken.findFirst({ where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
export const consumeAuthToken = (id, tx = prisma) => tx.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
export const deleteExpiredAuthTokens = (tx = prisma) => tx.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
