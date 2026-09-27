import expressRateLimit from "express-rate-limit";

const standard = ({ windowMs, max, message }) => expressRateLimit({
  windowMs,
  max,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message, code: "RATE_LIMIT_EXCEEDED" }),
});

export const rateLimit = standard;
export const authRateLimit = standard({ windowMs: 15 * 60_000, max: 10, message: "Too many authentication requests. Please try again later." });
export const paymentRateLimit = standard({ windowMs: 60_000, max: 30, message: "Too many payment requests. Please try again later." });
export const biometricRateLimit = standard({ windowMs: 60_000, max: 60, message: "Too many biometric requests. Please try again later." });
export const deviceGatewayRateLimit = standard({ windowMs: 60_000, max: 120, message: "Too many device gateway requests. Please try again later." });
