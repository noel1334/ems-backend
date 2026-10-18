# Leave and Work Schedule Backend Fix

This patch fixes three related issues:

1. Express 5 exposes `req.query` through a getter. The previous Zod middleware assigned directly to `req.query`, which causes validated list endpoints to throw and return HTTP 500. The middleware now stores validated values and safely defines a parsed query property.
2. Leave Type request validation matches the Prisma `LeaveType` model fields (`name`, `code`, entitlement and policy flags) rather than accepting an unsupported `description` field. List filters accept boolean `isActive` values and return consistent pagination metadata.
3. Employee schedule and shift assignment writes now include the required `companyId`, and assignment conflicts/primary updates are scoped to that company.

Run the helper from the backend repository root. It is designed to be safe to re-run.
