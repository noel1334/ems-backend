# Stage 29 — Production Security & Compliance Hardening

## Implemented
- Production HTTPS enforcement configuration via `REQUIRE_HTTPS` and secure-cookie validation.
- Wildcard CORS is rejected in production.
- Multiple explicit CORS origins are supported as a comma-separated allow-list.
- Express `trust proxy` is configurable for correct secure deployments.
- Production HSTS header is added.
- `Cache-Control: no-store` is applied to API responses.
- Request ID is exposed as `X-Request-ID` for operational tracing.
- Biometric/device gateway endpoints receive a dedicated rate limit.
- Attendance-device credential rotation is available to authorized administrators.
- Rotated device credentials are immediately deactivated and the new API key is returned only at rotation time.
- Credential rotation is audited.
- Existing tenant isolation, biometric rate limits, authentication, RBAC, audit logging, and hashed device credentials are retained.

## Device credential rotation

`POST /api/v1/attendance-devices/:id/credentials/:credentialId/rotate`

The returned API key is a secret and must be delivered securely to the device gateway. The backend stores only its SHA-256 hash.

## Production environment expectations

Set:

- `NODE_ENV=production`
- `COOKIE_SECURE=true`
- `CORS_ORIGIN=https://your-frontend.example.com`
- `APP_BASE_URL=https://your-api.example.com`
- `REQUIRE_HTTPS=true`
- `TRUST_PROXY=1` when running behind one trusted reverse proxy

Never commit JWT secrets, Supabase service-role keys, payment secrets, biometric provider keys, or device API keys.
