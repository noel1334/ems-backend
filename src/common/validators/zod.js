import { AppError } from "../errors/AppError.js";

export const validate = (schema, target = "body") => (req, res, next) => {
  const result = schema.safeParse(req[target]);
  if (!result.success) return next(new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: result.error.flatten() }));
  req[target] = result.data;
  return next();
};

export const validateBody = (schema) => validate(schema, "body");
export const validateQuery = (schema) => validate(schema, "query");
export const validateParams = (schema) => validate(schema, "params");
