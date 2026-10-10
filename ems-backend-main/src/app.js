import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import apiRoutes from "./route/index.js";

import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { securityHardeningMiddleware } from "./middleware/security-hardening.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import { errorHandler } from "./common/errors/error.middleware.js";

const app = express();

app.set("trust proxy", env.TRUST_PROXY);
app.use(securityHardeningMiddleware);

// ============================================================
// SECURITY
// ============================================================

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean),
    credentials: true,
  })
);

// ============================================================
// REQUEST PARSING
// ============================================================
app.use(
  "/api/v1/payments/webhooks/paystack",
  express.raw({
    type: "application/json",
  })
);
app.use("/api/v1/payments/webhooks/flutterwave", express.json());

app.use(
  express.json({
    limit: "2mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  })
);

app.use(cookieParser());

// ============================================================
// REQUEST ID
// ============================================================

app.use(requestIdMiddleware);

// ============================================================
// API ROUTES
// ============================================================

app.use("/api/v1", apiRoutes);

// ============================================================
// NOT FOUND
// ============================================================

app.use(notFoundMiddleware);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(errorHandler);

export default app;
