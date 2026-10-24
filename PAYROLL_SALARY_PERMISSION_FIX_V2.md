# EMS Employee Salaries Permission Fix V2

## What this fixes

The Employee Salaries screen returns `Permission denied: payroll.salaries.READ` because the earlier salary phase added a list endpoint guarded by READ, but the permission catalog and existing company role snapshots contained `payroll.salaries.CREATE` only. This patch adds READ and UPDATE to the catalog and payroll-officer templates, repairs existing admin/finance and existing salary-create role snapshots, and publishes a new version of affected published templates without rewriting their historical versions.

## Apply in Termux

Extract this ZIP into the EMS backend root (the folder containing `package.json`), then run:

```bash
node scripts/apply-payroll-salary-permission-fix-v2.mjs
node --check prisma/seed.js
node --check src/modules/platform/role-template-definitions.js
npm test -- tests/unit/payroll-salary-permissions.test.js
npm run prisma:validate
```

The migration is at `prisma/migrations/20261024100000_payroll_salary_read_update_permissions/migration.sql`. Before pushing, run `git diff --check` and inspect the staged files. Deploy the backend through the normal Render process that runs `prisma migrate deploy`; then verify the migration succeeded before retesting the app. Do not run the database seed against production as a substitute for the migration.

The migration grants salary READ/UPDATE only to active tenant roles which are company/finance administrators or already possess salary CREATE. It also repairs published role templates by publishing a new version preserving old permissions. It does not grant salary permissions to unrelated employee roles.
