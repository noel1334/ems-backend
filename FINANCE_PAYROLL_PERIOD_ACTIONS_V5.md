# Payroll Period Actions V5

## Fixes
- Company and finance administrators have a targeted backend permission override for `DELETE payroll.runs`, fixing stale tenant role snapshots that returned `Permission denied: payroll.runs.DELETE`.
- Company administrators can remove payroll periods in any completed status. Empty periods are physically deleted. Periods with linked payroll/payment records are soft-deleted (`deletedAt`) so they disappear from the active period list while payroll, provider, wallet-reference and audit history remain intact.
- Deletion is rejected while the period is processing or any disbursement/payout batch may still be in flight.
- Non-admin roles remain restricted to empty Draft/Calculated periods.
- Period list, detail and payout preparation queries exclude soft-deleted periods. Dashboard period counts exclude them.

## Database
The Prisma schema adds nullable `PayrollPeriod.deletedAt`. Deploy with the project's existing `npx prisma db push` step, then run `npx prisma generate`.

## Safety
Paid financial rows are not cascade-deleted. The period is hidden from the normal payroll list and the DELETE action is audit-logged with the actor, previous status and record counts. Active/uncertain transfers must be verified before removal.
