import { env } from "../../config/env.js";
import { AUTH_COOKIES } from "./auth.constants.js";

export { AUTH_COOKIES };

export const getAuthCookieOptions = () => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/"
});

export const getAccessCookieOptions = () => ({
    ...getAuthCookieOptions(),
    maxAge: 15 * 60 * 1000
});

export const getRefreshCookieOptions = () => ({
    ...getAuthCookieOptions()
});