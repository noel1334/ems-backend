# EMS Leave Policy Management — Backend V1

Patch for the existing EMS backend. It preserves the existing leave-request, approval, balance, and tenant-scope flows and adds configurable per-leave-type policy enforcement.

## Added policy fields
- `minNoticeDays`: minimum calendar-day notice before the leave start date (default `0`).
- `maxConsecutiveDays`: maximum working days in one request; `null` means no limit.
- `requiresReason`: rejects requests without a non-empty reason (default `false`).
- `allowHalfDay`: controls whether half-day requests are accepted (default `true`).

Policy rules are enforced on the server when requests are created or edited. Tenant isolation continues to use the request's company context and company-scoped repository queries. No separate SQL migration is included because this deployment uses `prisma db push`.

## Apply in Termux
Extract this ZIP into `~/work/ems-backend`, then run from the backend root:

```bash
node apply-leave-policy-backend-v1.mjs
npm run prisma:validate
npm run prisma:generate
node --check src/modules/leave/leave.service.js
node --check src/modules/leave/leave.validators.js
npm test
```

Review before commit:

```bash
git diff --check
git diff -- prisma/schema.prisma src/modules/leave/leave.validators.js src/modules/leave/leave.service.js
```

Stage only the intended files:

```bash
git add prisma/schema.prisma src/modules/leave/leave.validators.js src/modules/leave/leave.service.js
git diff --cached --check
git commit -m "feat: enforce configurable leave policies"
git fetch origin
git push origin HEAD:main
```

Ensure Render's build/start sequence runs `prisma db push` and `prisma generate` against the intended database before the new application version handles requests. Do not run schema synchronization against a production database until the target `DATABASE_URL` is verified.
