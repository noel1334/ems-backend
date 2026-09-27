import { AppError } from "../errors/AppError.js";

export const validateJoi = (schema, target = "body") => (req, res, next) => {
  const { value, error } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
  if (error) return next(new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: error.details }));
  req[target] = value;
  return next();
};

export const validateBody = (schema) => validateJoi(schema, "body");
export const validateQuery = (schema) => validateJoi(schema, "query");
export const validateParams = (schema) => validateJoi(schema, "params");
