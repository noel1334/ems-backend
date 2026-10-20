import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "./AppError.js";

export const errorHandler = (error, req, res, next) => {
  let statusCode = 500;
  let message = "Internal server error";
  let code = "INTERNAL_SERVER_ERROR";
  let details = null;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || "APPLICATION_ERROR";
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    details = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    const summary = details.map((item) => `${item.field || "request"}: ${item.message}`).join("; ");
    message = summary ? `Validation failed — ${summary}` : "Validation failed";
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        statusCode = 409;
        message = "A record with the provided value already exists";
        code = "DUPLICATE_RECORD";
        break;

      case "P2025":
        statusCode = 404;
        message = "Requested record was not found";
        code = "RECORD_NOT_FOUND";
        break;

      case "P2003":
        statusCode = 409;
        message = "A referenced employee, shift, or department is no longer available. Reload the schedule and try again.";
        code = "DATABASE_REFERENCE_CONFLICT";
        break;

      case "P2028":
        statusCode = 503;
        message = "The schedule operation took too long and was rolled back. Retry the operation; no partial changes were saved.";
        code = "DATABASE_TRANSACTION_TIMEOUT";
        break;

      case "P2034":
        statusCode = 409;
        message = "Another schedule update occurred at the same time. Reload the schedule and try again.";
        code = "DATABASE_WRITE_CONFLICT";
        break;

      case "P2021":
      case "P2022":
        statusCode = 500;
        message = "The database schema is not up to date for this operation. Contact the system administrator.";
        code = "DATABASE_SCHEMA_MISMATCH";
        break;

      default:
        statusCode = 500;
        message = "Database operation failed";
        code = "DATABASE_ERROR";
    }
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid database request";
    code = "DATABASE_VALIDATION_ERROR";
  } else if (error instanceof SyntaxError && error.status === 400) {
    statusCode = 400;
    message = "Invalid JSON payload";
    code = "INVALID_JSON";
  }

  if (statusCode === 400 && code === "VALIDATION_ERROR") {
    // Log field names/messages only; never log request bodies or passwords.
    console.warn(JSON.stringify({
      event: "api_validation_error",
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode,
      details,
    }));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Record only safe diagnostic metadata in production; never log request bodies
    // or database credentials. This lets an operator identify the real Prisma
    // failure behind an API error without exposing internals to the browser.
    console.error(JSON.stringify({
      event: "prisma_request_error",
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      code: error.code,
      meta: error.meta,
    }));
  } else if (env.NODE_ENV !== "production") {
    console.error(error);
  }

  const response = {
    success: false,
    message,
    code,
    requestId: req.requestId,
  };

  if (details) {
    response.details = details;
  }

  if (env.NODE_ENV !== "production") {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};
