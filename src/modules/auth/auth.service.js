import prisma from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import {
    comparePassword,
    generateTokenId,
    hashPassword,
    hashToken
} from "../../common/utils/crypto.js";
import {
    durationToMilliseconds,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} from "../../common/utils/jwt.js";
import {
    assignRoleToUser,
    createCompany,
    createSession,
    createUser,
    createWallet,
    findCompanyByEmail,
    findCompanyBySlug,
    findRoleByName,
    findSessionById,
    findUserByEmail,
    findUserById,
    revokeAllUserSessions,
    revokeUserSession,
    rotateSessionToken,
    updateUser
} from "./auth.repository.js";
import {
    AUTH_CONFIG,
    AUTH_ERRORS
} from "./auth.constants.js";

const getRefreshTokenExpiration = () =>
    new Date(
        Date.now() +
        durationToMilliseconds(
            env.JWT_REFRESH_EXPIRES_IN
        )
    );

const getUserRoles = (user) => {
    return (
        user.roles
            ?.filter(
                (userRole) =>
                    userRole.role?.isActive
            )
            .map(
                (userRole) =>
                    userRole.role.name
            ) ?? []
    );
};

const createAuthenticationTokens = ({
    user,
    sessionId
}) => {
    const roles = getUserRoles(user);

    const refreshTokenId =
        generateTokenId();

    const accessToken =
        generateAccessToken({
            userId: user.id,
            companyId: user.companyId,
            sessionId,
            roles
        });

    const refreshToken =
        generateRefreshToken({
            userId: user.id,
            companyId: user.companyId,
            sessionId,
            roles,
            tokenId: refreshTokenId
        });

    return {
        accessToken,
        refreshToken
    };
};

const createSessionAndTokens = async ({
    user,
    ipAddress,
    userAgent,
    deviceName,
    tx = prisma
}) => {
    /*
       * Create the session first because the JWT contains
          * the session ID.
             */
    const session = await createSession(
        {
            userId: user.id,
            companyId: user.companyId,
            refreshTokenHash: "pending",
            ipAddress,
            userAgent,
            deviceName,
            status: "ACTIVE",
            expiresAt:
                getRefreshTokenExpiration()
        },
        tx
    );

    const {
        accessToken,
        refreshToken
    } = createAuthenticationTokens({
        user,
        sessionId: session.id
    });

    const refreshTokenHash =
        hashToken(refreshToken);

    const updatedSession =
        await updateSession(
            session.id,
            {
                refreshTokenHash
            },
            tx
        );

    return {
        session: updatedSession,
        accessToken,
        refreshToken
    };
};

export const registerCompanyService =
    async ({
        company,
        admin,
        ipAddress,
        userAgent,
        deviceName
    }) => {
        const companyEmail =
            company.email.toLowerCase();

        const adminEmail =
            admin.email.toLowerCase();

        return prisma.$transaction(
            async (tx) => {
                const existingSlug =
                    await findCompanyBySlug(
                        company.slug,
                        tx
                    );

                if (existingSlug) {
                    throw new AppError(
                        "A company with this slug already exists",
                        409,
                        "COMPANY_SLUG_EXISTS"
                    );
                }

                const existingCompanyEmail =
                    await findCompanyByEmail(
                        companyEmail,
                        tx
                    );

                if (existingCompanyEmail) {
                    throw new AppError(
                        "A company with this email already exists",
                        409,
                        "COMPANY_EMAIL_EXISTS"
                    );
                }

                const existingAdmin =
                    await findUserByEmail(
                        adminEmail,
                        tx
                    );

                if (existingAdmin) {
                    throw new AppError(
                        "An account with this email already exists",
                        409,
                        "EMAIL_ALREADY_EXISTS"
                    );
                }

                const createdCompany =
                    await createCompany(
                        {
                            name: company.name,
                            legalName:
                                company.legalName,
                            slug: company.slug,
                            email: companyEmail,
                            phone: company.phone,
                            address: company.address,
                            city: company.city,
                            state: company.state,
                            country:
                                company.country,
                            timezone:
                                company.timezone,
                            currency:
                                company.currency
                        },
                        tx
                    );

                const passwordHash =
                    await hashPassword(
                        admin.password
                    );

                const createdUser =
                    await createUser(
                        {
                            companyId:
                                createdCompany.id,
                            email: adminEmail,
                            passwordHash,
                            firstName:
                                admin.firstName,
                            lastName:
                                admin.lastName,
                            middleName:
                                admin.middleName,
                            phone: admin.phone,
                            status: "ACTIVE",
                            emailVerified: false
                        },
                        tx
                    );

                const companyAdminRole =
                    await findRoleByName(
                        "COMPANY_ADMIN",
                        tx
                    );

                if (!companyAdminRole) {
                    throw new AppError(
                        "COMPANY_ADMIN role is not configured",
                        500,
                        "ROLE_CONFIGURATION_ERROR"
                    );
                }

                await assignRoleToUser(
                    {
                        userId:
                            createdUser.id,
                        roleId:
                            companyAdminRole.id
                    },
                    tx
                );

                await createWallet(
                    {
                        companyId:
                            createdCompany.id,
                        balance: 0
                    },
                    tx
                );

                const userWithRole =
                    await findUserById(
                        createdUser.id,
                        tx
                    );

                const authentication =
                    await createSessionAndTokens({
                        user: userWithRole,
                        ipAddress,
                        userAgent,
                        deviceName,
                        tx
                    });

                return {
                    company:
                        createdCompany,
                    user: userWithRole,
                    ...authentication
                };
            }
        );
    };

export const loginService = async ({
    email,
    password,
    ipAddress,
    userAgent,
    deviceName
}) => {
    const user =
        await findUserByEmail(email);

    if (!user) {
        throw new AppError(
            "Invalid email or password",
            401,
            AUTH_ERRORS.INVALID_CREDENTIALS
        );
    }

    const now = new Date();

    if (
        user.lockedUntil &&
        user.lockedUntil > now
    ) {
        throw new AppError(
            "Account temporarily locked. Please try again later.",
            423,
            AUTH_ERRORS.ACCOUNT_LOCKED
        );
    }

    if (user.status !== "ACTIVE") {
        throw new AppError(
            "This account is not active",
            403,
            AUTH_ERRORS.ACCOUNT_NOT_ACTIVE
        );
    }

    if (
        user.company &&
        user.company.status !== "ACTIVE"
    ) {
        throw new AppError(
            "This company account is not active",
            403,
            AUTH_ERRORS.COMPANY_NOT_ACTIVE
        );
    }

    const passwordMatches =
        await comparePassword(
            password,
            user.passwordHash
        );

    if (!passwordMatches) {
        const failedAttempts =
            user.failedLoginCount + 1;

        if (
            failedAttempts >=
            AUTH_CONFIG.MAX_FAILED_LOGIN_ATTEMPTS
        ) {
            const lockedUntil =
                new Date(
                    Date.now() +
                    AUTH_CONFIG.LOGIN_LOCK_MINUTES *
                    60 *
                    1000
                );

            await updateUser(user.id, {
                failedLoginCount:
                    failedAttempts,
                lockedUntil
            });

            throw new AppError(
                "Too many failed login attempts. Account temporarily locked.",
                423,
                AUTH_ERRORS.ACCOUNT_LOCKED
            );
        }

        await updateUser(user.id, {
            failedLoginCount:
                failedAttempts
        });

        throw new AppError(
            "Invalid email or password",
            401,
            AUTH_ERRORS.INVALID_CREDENTIALS
        );
    }

    const updatedUser =
        await updateUser(user.id, {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: now
        });

    const authentication =
        await createSessionAndTokens({
            user: updatedUser,
            ipAddress,
            userAgent,
            deviceName
        });

    return {
        user: updatedUser,
        ...authentication
    };
};

export const refreshAuthenticationService =
    async ({
        refreshToken,
        ipAddress,
        userAgent,
        deviceName
    }) => {
        if (!refreshToken) {
            throw new AppError(
                "Refresh token is required",
                401,
                AUTH_ERRORS.REFRESH_TOKEN_REQUIRED
            );
        }

        let payload;

        try {
            payload =
                verifyRefreshToken(
                    refreshToken
                );
        } catch {
            throw new AppError(
                "Invalid or expired refresh token",
                401,
                AUTH_ERRORS.INVALID_REFRESH_TOKEN
            );
        }

        const {
            userId,
            companyId,
            sessionId,
            tokenId
        } = payload;

        if (
            !userId ||
            !companyId ||
            !sessionId ||
            !tokenId
        ) {
            throw new AppError(
                "Invalid refresh token payload",
                401,
                AUTH_ERRORS.INVALID_REFRESH_TOKEN
            );
        }

        const presentedTokenHash =
            hashToken(refreshToken);

        return prisma.$transaction(
            async (tx) => {
                const session =
                    await findSessionById(
                        sessionId,
                        tx
                    );

                if (!session) {
                    throw new AppError(
                        "Session no longer exists",
                        401,
                        AUTH_ERRORS.SESSION_NOT_FOUND
                    );
                }

                if (
                    session.userId !== userId ||
                    session.companyId !==
                    companyId
                ) {
                    await revokeAllUserSessions(
                        session.userId,
                        tx
                    );

                    throw new AppError(
                        "Invalid refresh token",
                        401,
                        AUTH_ERRORS.INVALID_REFRESH_TOKEN
                    );
                }

                if (
                    session.status !==
                    "ACTIVE"
                ) {
                    throw new AppError(
                        "Session has been revoked",
                        401,
                        AUTH_ERRORS.SESSION_REVOKED
                    );
                }

                if (
                    session.expiresAt <=
                    new Date()
                ) {
                    throw new AppError(
                        "Refresh session has expired",
                        401,
                        AUTH_ERRORS.SESSION_EXPIRED
                    );
                }

                if (!session.user) {
                    throw new AppError(
                        "User account no longer exists",
                        401,
                        "USER_NOT_FOUND"
                    );
                }

                if (
                    session.user.status !==
                    "ACTIVE"
                ) {
                    throw new AppError(
                        "User account is not active",
                        403,
                        AUTH_ERRORS.ACCOUNT_NOT_ACTIVE
                    );
                }

                if (
                    !session.user.company
                ) {
                    throw new AppError(
                        "Company account no longer exists",
                        403,
                        "COMPANY_NOT_FOUND"
                    );
                }

                if (
                    session.user.company
                        .status !== "ACTIVE"
                ) {
                    throw new AppError(
                        "Company account is not active",
                        403,
                        AUTH_ERRORS.COMPANY_NOT_ACTIVE
                    );
                }

                /*
                         * If this doesn't match, the refresh token
                                  * has already been rotated.
                                           */
                if (
                    session.refreshTokenHash !==
                    presentedTokenHash
                ) {
                    await revokeAllUserSessions(
                        session.userId,
                        tx
                    );

                    throw new AppError(
                        "Refresh token reuse detected. All active sessions have been revoked.",
                        401,
                        AUTH_ERRORS.REFRESH_TOKEN_REUSE_DETECTED
                    );
                }

                const {
                    accessToken,
                    refreshToken:
                    newRefreshToken
                } =
                    createAuthenticationTokens({
                        user: session.user,
                        sessionId: session.id
                    });

                const newRefreshTokenHash =
                    hashToken(
                        newRefreshToken
                    );

                const newExpiresAt =
                    getRefreshTokenExpiration();

                /*
                         * The WHERE clause contains the old hash.
                                  *
                                           * Therefore only one concurrent request
                                                    * can successfully rotate this token.
                                                             */
                const rotation =
                    await rotateSessionToken(
                        session.id,
                        presentedTokenHash,
                        newRefreshTokenHash,
                        newExpiresAt,
                        tx
                    );

                if (rotation.count !== 1) {
                    await revokeAllUserSessions(
                        session.userId,
                        tx
                    );

                    throw new AppError(
                        "Refresh token reuse detected. All active sessions have been revoked.",
                        401,
                        AUTH_ERRORS.REFRESH_TOKEN_REUSE_DETECTED
                    );
                }

                const updatedSession =
                    await findSessionById(
                        session.id,
                        tx
                    );

                return {
                    user: session.user,
                    session:
                        updatedSession,
                    accessToken,
                    refreshToken:
                        newRefreshToken
                };
            }
        );
    };

export const logoutService = async ({
    userId,
    sessionId
}) => {
    if (!userId || !sessionId) {
        throw new AppError(
            "Authenticated session information is missing",
            401,
            "SESSION_INFORMATION_MISSING"
        );
    }

    const session =
        await findSessionById(
            sessionId
        );

    if (!session) {
        return {
            revoked: false
        };
    }

    if (session.userId !== userId) {
        throw new AppError(
            "Invalid session",
            403,
            "INVALID_SESSION"
        );
    }

    if (session.status === "REVOKED") {
        return {
            revoked: false
        };
    }

    const result =
        await revokeUserSession(
            userId,
            sessionId
        );

    return {
        revoked:
            result.count === 1
    };
};

export const logoutAllSessionsService =
    async ({ userId }) => {
        if (!userId) {
            throw new AppError(
                "Authenticated user information is missing",
                401,
                "USER_INFORMATION_MISSING"
            );
        }

        const result =
            await revokeAllUserSessions(
                userId
            );

        return {
            revokedCount: result.count
        };
    };

export const getAuthenticatedUser =
    async (userId) => {
        const user =
            await findUserById(userId);

        if (!user) {
            throw new AppError(
                "Authenticated user not found",
                401,
                "USER_NOT_FOUND"
            );
        }

        return user;
    };

export const getAuthenticatedSession =
    async (sessionId) => {
        const session =
            await findSessionById(
                sessionId
            );

        if (!session) {
            throw new AppError(
                "Authenticated session not found",
                401,
                "SESSION_NOT_FOUND"
            );
        }

        return session;
    };