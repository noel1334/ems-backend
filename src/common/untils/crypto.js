import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_SALT_ROUNDS = 12;

export const hashPassword = async (password) => {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (
    password,
    passwordHash
) => {
    return bcrypt.compare(password, passwordHash);
};

export const hashToken = (token) => {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
};

export const generateRandomToken = (bytes = 32) => {
    return crypto.randomBytes(bytes).toString("hex");
};

export const generateTokenId = () => {
    return crypto.randomUUID();
};