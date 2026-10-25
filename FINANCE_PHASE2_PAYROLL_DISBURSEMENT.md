# EMS Finance Phase 2 — Payroll correction, disbursement and reconciliation

## Scope
- Allows an authorized payroll approver to reopen an APPROVED or FINALIZED period for correction before a disbursement batch exists. A reason is mandatory and the action is audit logged.
- A reopened period returns to CALCULATED and its payroll items return to CALCULATED. Correct source salary/attendance data, recalculate, approve and finalize again.
- Prepares a tenant-scoped disbursement register from positive net-pay payroll items in a FINALIZED period.
- Records manual bank/provider transfer reconciliation per employee, requiring an external transaction reference for PAID and a reason for FAILED.
- Automatically marks the payroll period and its payroll items PAID only when all disbursement records are PAID.

## Important operating boundary
This phase does **not** initiate a bank transfer or call Paystack/Flutterwave transfer APIs. Finance staff must make the actual transfer using the company's bank/provider, then reconcile it here. Do not mark a row PAID until the provider confirms it.

Once a disbursement batch exists, reopening the period is blocked. If a payment has been prepared or paid, do not silently edit the finalized amount; document an adjustment in a later payroll or implement an audited reversal workflow as a separate phase.

## Deployment
1. Review the schema additions in `prisma/schema.prisma`.
2. Ensure the Render backend build/deploy command runs `prisma generate && prisma db push` (the project's existing deployment approach).
3. Deploy the backend before deploying the frontend.
4. Existing permission `payroll/runs/APPROVE` protects correction, batch preparation, and reconciliation actions. `payroll/runs/READ` protects viewing disbursements.

## New endpoints
- `POST /payroll/periods/:id/reopen-for-correction` body `{ "reason": "..." }`
- `GET /payroll/periods/:id/disbursements`
- `POST /payroll/periods/:id/disbursements/prepare`
- `PATCH /payroll/disbursements/:disbursementId/status` body `{ "status": "PAID"|"FAILED"|"PENDING", "externalReference"?: "...", "note"?: "..." }`
