import crypto from "node:crypto";

export function requestIdMiddleware(req, res, next) {
  const incoming = req.get("X-Request-ID");
  const requestId = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}
