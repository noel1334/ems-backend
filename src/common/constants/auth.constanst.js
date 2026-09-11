import { env } from "../../config/env.js";

export const AUTH_COOKIES = {
  ACCESS: "ems_access_token",
  REFRESH: "ems_refresh_token",
};

export const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/",
});

export const AUTH_MESSAGES = {
  INVALID_CREDENTIALS: "Invalid email or password",
  ACCOUNT_LOCKED: "Account is temporarily locked",
  ACCOUNT_INACTIVE: "This account is not active",
  AUTHENTICATION_REQUIRED: "Authentication is required",
  INVALID_ACCESS_TOKEN: "Invalid or expired access token",
  INVALID_REFRESH_TOKEN: "Invalid or expired refresh token",
  SESSION_REVOKED: "This session has been revoked",
  REFRESH_TOKEN_REUSED: "Refresh token reuse detected",
};

export const LOGIN_SECURITY = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCK_DURATION_MINUTES: 15,
};
