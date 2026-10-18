import { AppError } from "../errors/AppError.js";

export const validate = (schema, target = "body") => (req, res, next) => {
  const result = schema.safeParse(req[target]);
  if (!result.success) return next(new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: result.error.flatten() }));

  // Keep validated inputs in a stable place for services. Express 5 implements
  // req.query as a getter, so redefine it as an own data property instead of
  // assigning through the getter (which raises a TypeError and becomes HTTP 500).
  req.validated = { ...(req.validated ?? {}), [target]: result.data };
  if (target === "query") {
    Object.defineProperty(req, "query", { configurable: true, enumerable: true, writable: true, value: result.data });
  } else {
    req[target] = result.data;
  }
  return next();
};

export const validateBody = (schema) => validate(schema, "body");
export const validateQuery = (schema) => validate(schema, "query");
export const validateParams = (schema) => validate(schema, "params");
