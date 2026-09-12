import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

const buildPayload = ({
    userId,
    companyId,
    sessionId,
    roles = [],
    tokenId
}) => ({
    userId,
    companyId,
    sessionId,
    roles,
    tokenId
});

export const generateAccessToken = ({
    userId,
    companyId,
    sessionId,
    roles = []
}) => {
    return jwt.sign(
        buildPayload({
            userId,
            companyId,
            sessionId,
            roles
        }),
        env.JWT_ACCESS_SECRET,
        {
            expiresIn: env.JWT_ACCESS_EXPIRES_IN
        }
    );
};

export const generateRefreshToken = ({
    userId,
    companyId,
    sessionId,
    roles = [],
    tokenId
}) => {
    return jwt.sign(
        buildPayload({
            userId,
            companyId,
            sessionId,
            roles,
            tokenId
        }),
        env.JWT_REFRESH_SECRET,
        {
            expiresIn: env.JWT_REFRESH_EXPIRES_IN
        }
    );
};

export const verifyAccessToken = (token) => {
    return jwt.verify(
        token,
        env.JWT_ACCESS_SECRET
    );
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(
        token,
        env.JWT_REFRESH_SECRET
    );
};

export const durationToMilliseconds = (duration) => {
    if (typeof duration === "number") {
        return duration * 1000;
    }

    const match = String(duration)
        .trim()
        .match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);

    if (!match) {
        throw new Error(
            `Invalid duration format: ${duration}`
        );
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
};