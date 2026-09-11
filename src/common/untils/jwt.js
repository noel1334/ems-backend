import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export const generateAccessToken = ({
  userId,
  companyId,
  sessionId,
  roles = [],
}) => {
  return jwt.sign(
    {
      type: "access",
      userId,
      companyId,
      sessionId,
      roles,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: "ems-backend",
      audience: "ems-client",
    }
  );
};

export const generateRefreshToken = ({
  userId,
  companyId,
  sessionId,
  tokenId,
}) => {
  return jwt.sign(
    {
      type: "refresh",
      userId,
      companyId,
      sessionId,
      tokenId,
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: "ems-backend",
      audience: "ems-client",
    }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "ems-backend",
    audience: "ems-client",
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: "ems-backend",
    audience: "ems-client",
  });
};
