export class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || null;
    this.details = options.details || null;
    this.isOperational = options.isOperational ?? true;

    Error.captureStackTrace(this, this.constructor);
  }
}
