# EMS Employee Salaries permission repair (V5)

The repeated `Permission denied: payroll.salaries.READ` indicates that the request's active tenant-owned role did not have an effective READ grant in the database used by the API. The previous script required an existing salary write grant and was not guaranteed to run when the deployment used a different start/build command.

This patch:

- Reconciles the `payroll.salaries.READ` and `payroll.salaries.UPDATE` permission catalog entries.
- Grants only active company-owned (`scope = COMPANY`, non-null company ID) roles that are COMPANY_ADMIN, FINANCE_ADMIN, already authorised to write salaries, or linked to a published template that explicitly permits salary access.
- Does not grant salary permissions to shared/global system roles or unrelated employee roles.
- Runs the idempotent reconciliation during backend startup before the API starts listening, so it works with `prisma db push` deployments as well as migration-based deployments.
- Keeps `requirePermission` and tenant checks in place; it does not bypass the permission middleware.

## Validate locally

From the backend root:

```bash
npx prisma generate
node --check src/bootstrap/payroll-salary-permission-bootstrap.js
node --check src/server.js
node --check scripts/reconcile-payroll-salary-read-permission.mjs
npm test -- tests/unit/payroll-salary-permission-bootstrap.test.js
```

If you want to run the reconciliation manually against the current `DATABASE_URL`:

```bash
npm run permissions:reconcile-payroll-salaries
```

## Deploy and verify

Push the backend patch and redeploy the Render backend. The Render service must use the same `DATABASE_URL` for which the API reads payroll data. In the startup logs, find `Payroll salary permission reconciliation result`. Then sign out and sign back in, and open Employee Salaries again.

If it still fails, run the read-only diagnostic in Render Shell against the same database, substituting the affected user's sign-in email:

```bash
EMS_PERMISSION_DIAGNOSE_EMAIL='affected-user@example.com' node scripts/diagnose-payroll-salary-read-permission.mjs
```

The diagnostic output tells whether the account has a tenant-owned active role with the effective salary READ grant. Do not paste database URLs, access tokens, or passwords into logs or chat.
