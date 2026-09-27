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
    message = "Validation failed";
    code = "VALIDATION_ERROR";

    details = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
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

  if (env.NODE_ENV !== "production") {
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
