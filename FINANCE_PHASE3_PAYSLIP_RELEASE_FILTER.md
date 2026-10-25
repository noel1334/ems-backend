# EMS Finance Phase 3 — Server-side Payslip Release Rule

This focused patch updates `getMyPayslips` in `src/modules/self-service/self-service.service.js` so that an employee can only retrieve payslips associated with payroll periods whose status is `FINALIZED` or `PAID`.

It uses the existing company and authenticated employee filters, so no schema change or route change is required. The frontend also hides unreleased items, but the backend is the authoritative control.

## Apply in Termux

```bash
unzip -o ~/storage/downloads/ems-finance-phase3-backend-patch-v1.zip -d .
node scripts/apply-finance-phase3-payslip-visibility.mjs
node --check src/modules/self-service/self-service.service.js
npm test
```

Review, then stage only the intended files:

```bash
git diff --check
git status -sb
git add src/modules/self-service/self-service.service.js scripts/apply-finance-phase3-payslip-visibility.mjs FINANCE_PHASE3_PAYSLIP_RELEASE_FILTER.md
git diff --cached --check
git diff --cached --stat
git commit -m "fix: release employee payslips after payroll finalization"
git push origin HEAD
```

Deploy the backend to Render before relying on the self-service payslip page. No Prisma migration or `prisma db push` is required for this patch.
