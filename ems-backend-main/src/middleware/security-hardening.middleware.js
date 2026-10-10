import crypto from "node:crypto";
import { env } from "../config/env.js";

export const securityHardeningMiddleware = (req, res, next) => {
  if (env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("X-Request-ID", req.requestId || crypto.randomUUID());
  res.setHeader("Cache-Control", "no-store");
  next();
};
