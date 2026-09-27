# EMS Backend Production Checklist

## Completed in this stage
- Request ID middleware
- Generic/auth/payment/biometric rate limiting
- Pagination helpers
- Employee-number formatting helper
- Session repository/service/controller/routes
- AuditLog schema + reusable audit writer
- Payment/APP constants
- Production hardening notes

## Before production
1. Run `npm install`.
2. Run `npx prisma format`.
3. Run `npx prisma validate`.
4. Run `npx prisma generate`.
5. Review and apply the migration against a staging database first.
6. Configure strong JWT secrets and database credentials.
7. Configure Paystack/Flutterwave webhook secrets and verify webhook signatures.
8. Ensure payment/webhook handlers are idempotent.
9. Ensure every tenant-scoped query uses the authenticated `companyId`.
10. Never accept a client-supplied `companyId` as authorization.
11. Put employee documents in private object storage with signed URLs in production.
12. Connect a real biometric provider under `src/modules/biometrics/providers/`.
13. Route verified biometric events through the attendance service.
14. Make processed/paid payroll immutable.
15. Run unit/integration/security tests against a staging PostgreSQL database.
16. Add database backups, monitoring, error reporting, and secret rotation.
