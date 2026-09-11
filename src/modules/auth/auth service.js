import { randomUUID } from "node:crypto";
import prisma from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../common/utils/jwt.js";
import {
  generateRandomToken,
  hashPassword,
  hashToken,
} from "../../common/utils/crypto.js";
import {
  findRoleByName,
  findSessionById,
  findUserByEmail,
  findUserById,
  createSession,
} from "./auth.repository.js";

const getRefreshTokenExpiration = () => {
  const value = env.JWT_REFRESH_EXPIRES_IN;

  const match = value.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(
      "JWT_REFRESH_EXPIRES_IN must use a simple format such as 15m, 7d, 12h or 60s"
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const milliseconds = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + amount * milliseconds[unit]);
};

const getUserRoles = (user) =>
  user.roles?.map((userRole) => userRole.role.name) ?? [];

export const buildAuthenticationTokens = async ({ user, sessionId }) => {
  const roles = getUserRoles(user);

  const accessToken = generateAccessToken({
    userId: user.id,
    companyId: user.companyId,
    sessionId,
    roles,
  });

  const tokenId = randomUUID();

  const refreshToken = generateRefreshToken({
    userId: user.id,
    companyId: user.companyId,
    sessionId,
    tokenId,
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
    tokenId,
  };
};

export const createAuthenticationSession = async ({
  user,
  ipAddress,
  userAgent,
  deviceName,
}) => {
  const temporarySession = await createSession({
    userId: user.id,
    companyId: user.companyId,
    refreshTokenHash: "pending",
    ipAddress,
    userAgent,
    deviceName,
    expiresAt: getRefreshTokenExpiration(),
  });

  try {
    const tokens = await buildAuthenticationTokens({
      user,
      sessionId: temporarySession.id,
    });

    const session = await prisma.userSession.update({
      where: {
        id: temporarySession.id,
      },
      data: {
        refreshTokenHash: tokens.refreshTokenHash,
      },
    });

    return {
      session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    await prisma.userSession
      .delete({
        where: {
          id: temporarySession.id,
        },
      })
      .catch(() => {});

    throw error;
  }
};

export const getAuthenticatedUser = async (userId) => {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError("User not found", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  return user;
};

export const getAuthenticatedSession = async (sessionId) => {
  const session = await findSessionById(sessionId);

  if (!session) {
    throw new AppError("Session not found", 401, {
      code: "SESSION_NOT_FOUND",
    });
  }

  return session;
};

export const preparePassword = async (password) => {
  return hashPassword(password);
};

export const prepareRefreshToken = () => {
  return generateRandomToken();
};

export const getUserForLogin = async (email) => {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError("Invalid email or password", 401, {
      code: "INVALID_CREDENTIALS",
    });
  }

  return user;
};

export const getCompanyAdminRole = async (tx = prisma) => {
  const role = await findRoleByName("COMPANY_ADMIN", tx);

  if (!role) {
    throw new AppError("The COMPANY_ADMIN role has not been seeded", 500, {
      code: "COMPANY_ADMIN_ROLE_NOT_FOUND",
    });
  }

  return role;
};
