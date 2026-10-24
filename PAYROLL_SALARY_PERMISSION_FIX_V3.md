# EMS Payroll Salary Permission Reconciliation V3

## Why V3 exists

The runtime guard checks the exact `payroll.salaries.READ` permission on an **active company-owned role assigned to the signed-in user**, and also requires that role's `companyId` matches the user's company. A checkbox on a global role template is not effective until the matching permission is granted to the tenant role snapshot. V3 reconciles those snapshots while preserving the backend's tenant-scope checks.

## Apply in the backend root

Extract the ZIP in the EMS backend directory, then run:

```bash
node scripts/apply-payroll-salary-permission-fix-v3.mjs
node --check scripts/diagnose-payroll-salary-read-permission.mjs
node --check prisma/seed.js
node --check src/modules/platform/role-template-definitions.js
npm test -- tests/unit/payroll-salary-permission-reconcile.test.js
npm run prisma:validate
```

The additive migration is `prisma/migrations/20261024113000_reconcile_payroll_salary_role_permissions/migration.sql`. Deploy through the normal Render process that runs `prisma migrate deploy`; verify the migration succeeded before retesting Vercel. This migration ensures the catalog entries exist, versions affected published templates rather than rewriting old versions, and grants payroll salary access only to active company-owned roles already authorised for salary management or explicitly associated with a payroll/salary-enabled template. It does not grant access to shared/global roles or all employees.

## Read-only diagnostic if access is still denied

Run the diagnostic against the same database used by Render. In Render Shell (or another environment with the production database URL configured), set the affected user's sign-in email without committing it:

```bash
EMS_PERMISSION_DIAGNOSE_EMAIL='the-user-email@example.com' node scripts/diagnose-payroll-salary-read-permission.mjs
```

The output reports each active role's name, scope, company match, and effective salary READ grant. It does not modify data. Do not share database URLs, passwords, or access tokens.

## Security notes

This patch does not bypass `requirePermission`. If the diagnostic reports that a role should authorize reads but the live API still denies access, check that Render deployed the same commit and connects to the same database. If no role qualifies, use the report to identify whether a grant is missing or the user is assigned to a stale/non-tenant role before changing privileges.
