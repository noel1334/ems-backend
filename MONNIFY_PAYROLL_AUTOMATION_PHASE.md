# Monnify automated payroll disbursement

This phase adds a company-scoped payroll preflight, bulk submission, OTP authorization (existing batch endpoint), and employee-level reconciliation.

## Workflow
1. Connect each tenant's own Monnify API key/secret, contract code, and disbursement source account in Payroll.
2. Open a finalized payroll period and choose **Validate selected payroll** in the Company Monnify account panel.
3. Preflight checks the tenant's Monnify bank directory, resolves every active employee bank account through Monnify name enquiry, checks the finalized net salary against the payment register, and checks the company's Monnify disbursement balance.
4. Review the employee list and select **Submit salary batch**. This submits one Monnify bulk batch. The EMS internal company wallet is not debited; funds are held in the company's Monnify disbursement wallet.
5. Enter the OTP in the recent batch row when Monnify reports `PENDING_AUTHORIZATION`.
6. Refresh the provider batch and select **Reconcile employees**. Successful transfers are marked `PAID`; definitive `FAILED`, `REVERSED`, or `EXPIRED` transactions are marked `FAILED`; pending statuses remain processing.

## Safety
- A non-terminal Monnify batch blocks creating a second batch for the same payroll period.
- Each beneficiary transaction reference is derived from the unique EMS payroll disbursement ID.
- An uncertain submission is persisted as `SUBMISSION_UNKNOWN`; do not submit again until the reference has been checked with Monnify.
- Tenant credentials are decrypted only server-side and are fetched by `companyId`.
- This flow intentionally does not reserve/debit the EMS internal wallet because the funding source is the company's separate Monnify disbursement wallet.
- Bank matching is exact after normalization. Ambiguous/unmatched bank names block submission rather than guessing a bank code.

## Deployment prerequisites
- Preserve `MONNIFY_CREDENTIALS_ENCRYPTION_KEY`; changing it makes previously stored credentials unreadable.
- Apply the updated Prisma schema already present in this source if your deployment process has not yet applied it (`npx prisma db push`). This phase adds no new schema models/columns.
- Live disbursement requires Monnify to enable third-party disbursements for the tenant, correct source wallet funding, and a stable Render outbound IP allowlisted by Monnify.
- Validate the complete flow in sandbox before switching a tenant to live. Never use a live account for initial testing.

## Known operational limitation
Monnify transaction listing is paginated. Reconciliation now fetches pages until the provider reports the final page or a short page.
