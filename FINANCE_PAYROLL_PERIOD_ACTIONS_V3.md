# Payroll Period Actions V3

## Included
- Added `PayrollPeriod.isActive` (default true) to support period activation/deactivation without changing the financial payroll status.
- Added tenant-scoped `PATCH /api/v1/payroll/periods/:id/active` with `payroll:runs:UPDATE` permission and request validation.
- Activation changes are audit logged.
- Deactivation is blocked while the period is processing or while payout transfers are pending/in flight.
- Inactive periods cannot be calculated, approved, finalized, prepared for disbursement, or previewed for automated payout until reactivated.
- Empty draft periods remain deletable. Paid/finalized payroll and payment history are protected.
- Calculated periods without payment batches can have their name/pay date corrected; their date range is locked when payroll items exist.
- Period list responses include `isActive` for desktop/mobile status badges and actions.

## Deployment note
The backend deployment must run `npx prisma generate` and `npx prisma db push` (the existing Render build command in this project) so the new `isActive` column exists. Existing rows default to active. This does not send any salary transfers.
