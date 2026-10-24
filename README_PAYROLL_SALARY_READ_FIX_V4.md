# EMS employee-salary listing and permission repair (V4)

This patch addresses two separate problems in the uploaded backend:

1. Adds `GET /salaries` to the payroll router, with tenant-scoped listing, search, status/structure filters, pagination, employee details and payroll-structure components.
2. Adds an idempotent permission reconciliation script compatible with a deployment that uses `prisma db push`.

## Apply locally

From the backend project root:

```bash
npm install
npx prisma generate
npx prisma db push
npm run permissions:reconcile-payroll-salaries
node --check src/modules/payroll/payroll.service.js
node --check src/modules/payroll/payroll.controller.js
node --check src/modules/payroll/payroll.routes.js
node --check scripts/reconcile-payroll-salary-read-permission.mjs
npm test
```

## Render deployment

Keep the existing build command and append the reconciliation command after Prisma has generated the client and `db push` has completed. For example, if the current build command is `npm install && npx prisma generate && npx prisma db push`, use:

```bash
npm install && npx prisma generate && npx prisma db push && npm run permissions:reconcile-payroll-salaries
```

Do not replace existing environment variables. The script only grants `payroll.salaries.READ` to active company-scoped roles that already have an active `payroll.salaries.CREATE`, `UPDATE`, or `DELETE` grant. It does not grant salary access to every role and does not bypass tenant checks. It is safe to run more than once.

## Verify

Render build logs should contain `Payroll salary permission reconciliation result`. If the user's role has no salary write permissions by design, this script will not grant READ to it; assign the appropriate permissions through the EMS role-management UI instead.

After deployment, sign out and sign in again, then open Employee Salaries. The API response shape is `{ success: true, data: { items, pagination, summary } }`.
