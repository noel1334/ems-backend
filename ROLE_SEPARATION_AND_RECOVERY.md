# Role separation and recovery

## Role boundaries

- `SUPER_ADMIN` is a platform-level account: `users.companyId` is `NULL`, and the user must have the global `SUPER_ADMIN` role with `scope=SYSTEM`.
- `COMPANY_ADMIN` is a tenant-level account: it has a real `companyId` and a company-owned `COMPANY_ADMIN` role with `scope=COMPANY`.
- The demo bootstrap account is deliberately a Company Admin for the demo tenant. It must not be reused as the platform owner.
- The `/platform/*` API is guarded by `requireSuperAdmin`. `/users/*` is guarded by tenant middleware and all user queries require a company scope.

## Production behavior

`BOOTSTRAP_DEMO_DATA=true` no longer creates/recreates demo users in production unless `ALLOW_DEMO_BOOTSTRAP_IN_PRODUCTION=true` is also set. Existing demo rows are not deleted automatically; remove test-only accounts from the appropriate tenant using the admin UI after verifying they contain no needed data.

## Role recovery

Startup repairs missing built-in role definitions from published role templates without overwriting existing tenant role permissions. When both `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` are configured, the startup bootstrap ensures that account has the platform role. It refuses to promote an account whose email belongs to a company user.

If `user_roles` records were deleted by manually deleting roles, prior assignments cannot be inferred safely from the remaining data. After the platform account is restored, open **Super Admin Console → Users**, select the correct company and use **Assign roles** on each affected existing user. Choose only that company's roles; do not assign Super Admin to tenant accounts. If active permissions or published core role templates are missing, run the configured Prisma seed (`npx prisma db seed`) before retrying deployment.
