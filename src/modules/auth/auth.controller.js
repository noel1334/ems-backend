import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import {
    durationToMilliseconds
} from "../../common/utils/jwt.js";
import {
    AUTH_COOKIES,
    getAuthCookieOptions
} from "./auth.cookies.js";
import {
    getAuthenticatedUser,
    loginService,
    logoutAllSessionsService,
    logoutService,
    refreshAuthenticationService,
    registerCompanyService,
    requestPasswordResetService, resetPasswordService, changePasswordService, requestEmailVerificationService, verifyEmailService
} from "./auth.service.js";
import {
    loginSchema,
    registerCompanySchema, passwordResetRequestSchema, passwordResetSchema, changePasswordSchema, verifyEmailSchema
} from "./auth.validation.js";
import {
    mapSession,
    mapUser
} from "./auth.mapper.js";

const setAuthenticationCookies = (
    res,
    accessToken,
    refreshToken
) => {
    const cookieOptions =
        getAuthCookieOptions();

    res.cookie(
        AUTH_COOKIES.ACCESS,
        accessToken,
        {
            ...cookieOptions,
            maxAge:
                durationToMilliseconds(
                    env.JWT_ACCESS_EXPIRES_IN
                )
        }
    );

    res.cookie(
        AUTH_COOKIES.REFRESH,
        refreshToken,
        {
            ...cookieOptions,
            maxAge:
                durationToMilliseconds(
                    env.JWT_REFRESH_EXPIRES_IN
                )
        }
    );
};

const clearAuthenticationCookies =
    (res) => {
        const cookieOptions =
            getAuthCookieOptions();

        res.clearCookie(
            AUTH_COOKIES.ACCESS,
            cookieOptions
        );

        res.clearCookie(
            AUTH_COOKIES.REFRESH,
            cookieOptions
        );
    };

export const authHealth = (
    req,
    res
) => {
    return res.status(200).json({
        success: true,
        message:
            "Authentication service is healthy"
    });
};

export const registerCompany = async (
    req,
    res
) => {
    const parsed =
        registerCompanySchema.safeParse(
            req.body
        );

    if (!parsed.success) {
        throw new AppError(
            "Validation failed",
            400,
            "VALIDATION_ERROR",
            parsed.error.flatten()
        );
    }

    const result =
        await registerCompanyService({
            ...parsed.data,
            ipAddress: req.ip,
            userAgent:
                req.get("user-agent"),
            deviceName:
                req.get("x-device-name")
        });

    setAuthenticationCookies(
        res,
        result.accessToken,
        result.refreshToken
    );

    return res.status(201).json({
        success: true,
        message:
            "Company registered successfully",
        data: {
            company: result.company,
            user: mapUser(result.user),
            session: mapSession(
                result.session
            )
        }
    });
};

export const login = async (
    req,
    res
) => {
    const parsed =
        loginSchema.safeParse(
            req.body
        );

    if (!parsed.success) {
        throw new AppError(
            "Validation failed",
            400,
            "VALIDATION_ERROR",
            parsed.error.flatten()
        );
    }

    const result =
        await loginService({
            ...parsed.data,
            ipAddress: req.ip,
            userAgent:
                req.get("user-agent"),
            deviceName:
                req.get("x-device-name")
        });

    setAuthenticationCookies(
        res,
        result.accessToken,
        result.refreshToken
    );

    return res.status(200).json({
        success: true,
        message:
            "Login successful",
        data: {
            user: mapUser(result.user),
            session: mapSession(
                result.session
            )
        }
    });
};

export const refresh = async (
    req,
    res
) => {
    const refreshToken =
        req.cookies?.[
        AUTH_COOKIES.REFRESH
        ];

    if (!refreshToken) {
        clearAuthenticationCookies(
            res
        );

        throw new AppError(
            "Refresh token is required",
            401,
            "REFRESH_TOKEN_REQUIRED"
        );
    }

    try {
        const result =
            await refreshAuthenticationService(
                {
                    refreshToken,
                    ipAddress: req.ip,
                    userAgent:
                        req.get("user-agent"),
                    deviceName:
                        req.get("x-device-name")
                }
            );

        setAuthenticationCookies(
            res,
            result.accessToken,
            result.refreshToken
        );

        return res.status(200).json({
            success: true,
            message:
                "Authentication tokens refreshed successfully",
            data: {
                user: mapUser(
                    result.user
                ),
                session: mapSession(
                    result.session
                )
            }
        });
    } catch (error) {
        clearAuthenticationCookies(
            res
        );

        throw error;
    }
};

export const logout = async (
    req,
    res
) => {
    await logoutService({
        userId: req.user.userId,
        sessionId:
            req.user.sessionId
    });

    clearAuthenticationCookies(
        res
    );

    return res.status(200).json({
        success: true,
        message:
            "Logged out successfully"
    });
};

export const logoutAllSessions =
    async (req, res) => {
        const result =
            await logoutAllSessionsService({
                userId: req.user.userId
            });

        clearAuthenticationCookies(
            res
        );

        return res.status(200).json({
            success: true,
            message:
                "All sessions have been logged out",
            data: {
                revokedSessions:
                    result.revokedCount
            }
        });
    };

export const getCurrentUser =
    async (req, res) => {
        const user =
            await getAuthenticatedUser(
                req.user.userId
            );

        return res.status(200).json({
            success: true,
            data: {
                user: mapUser(user)
            }
        });
    };

export const requestPasswordReset = async (req, res) => { const parsed = passwordResetRequestSchema.parse(req.body); const data = await requestPasswordResetService({ ...parsed, ipAddress: req.ip, userAgent: req.get("user-agent") }); return res.json({ success: true, data }); };
export const resetPassword = async (req, res) => { const parsed = passwordResetSchema.parse(req.body); const data = await resetPasswordService({ ...parsed, ipAddress: req.ip, userAgent: req.get("user-agent") }); return res.json({ success: true, data }); };
export const changePassword = async (req, res) => { const parsed = changePasswordSchema.parse(req.body); const data = await changePasswordService({ userId: req.user.userId, ...parsed, ipAddress: req.ip, userAgent: req.get("user-agent") }); return res.json({ success: true, data }); };
export const requestEmailVerification = async (req, res) => res.json({ success: true, data: await requestEmailVerificationService({ userId: req.user.userId, ipAddress: req.ip, userAgent: req.get("user-agent") }) });
export const verifyEmail = async (req, res) => { const parsed = verifyEmailSchema.parse(req.body); return res.json({ success: true, data: await verifyEmailService(parsed) }); };
