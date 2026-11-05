# EMS Company Paystack Salary Distribution — V3

This V3 patch fixes the new TEST-mode limit shown in `Screenshot_2026-11-04-12-20-58-874_com.android.chrome.jpg`.

## Root cause

The V2 flow called Paystack `/bank/resolve` for each employee while using the company's TEST secret key. The latest screenshot shows Paystack's TEST daily limit of three live bank resolves has been exceeded. This is a provider lookup limit, not proof that all employee bank accounts are wrong.

## V3 changes

- TEST mode skips `/bank/resolve` by default to conserve the daily lookup allowance.
- TEST preview labels rows as sandbox preflight; it does not claim the accounts have been provider-verified.
- TEST submission creates all recipients with the company's TEST key before initiating any transfer. If recipient preparation fails for any employee, no salary transfer request is sent.
- LIVE mode always requires provider account resolution before submission.
- If a manually enabled TEST resolver hits the provider's daily cap, EMS defers the affected row to recipient preparation instead of treating the quota response as a bank mismatch.
- The frontend identifies TEST transfers as simulated and warns that no real salary money moves.

## Important environment setting

In Render, set this variable to false or remove it:

```env
PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=false
```

V3 defaults to false when unset. If you previously set it to `true` based on V2 instructions, change it to false. LIVE mode always verifies accounts regardless of this value.

Do not change employees' saved bank codes to `001`. That is a sandbox lookup code mentioned by the provider error, not an employee's real bank-selection code. Keep the actual provider-specific bank details intact.

## Download contents

- Backend ZIP: updates `.env.example`, Paystack service/utilities and unit tests; adds the V3 backend note.
- Frontend ZIP: updates the Company Paystack payroll preview, row labels and confirmation dialog.

No schema migration is required.

## Apply in Termux

Assuming the V2 patch is already applied:

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-company-paystack-backend-fix-v3.zip -d .

node --check src/modules/payments/company-paystack/company-paystack.service.js
node --check src/modules/payments/company-paystack/company-paystack.utils.js
npm test -- tests/unit/company-paystack.utils.test.js
npm test
git diff --check
```

```bash
cd ~/work/ems-frontend2-main
unzip -o ~/storage/downloads/ems-company-paystack-frontend-fix-v3.zip -d .
npm run build
git diff --check
```

## Render and Vercel deployment sequence

1. Run backend tests. Commit/push backend `main` and wait for Render deployment.
2. Set `PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=false` in Render if the variable already exists as true. Restart/redeploy the backend after changing environment variables.
3. Build frontend, then commit/push frontend `main` and wait for Vercel deployment.
4. In the company Paystack TEST connection, preview a new finalized payroll. The rows should show `Sandbox preflight — Paystack recipient checked on submit`, not `Blocked` because the lookup quota ran out.
5. Submit only once. EMS must create all recipients before it sends test transfers. Inspect the new batch. If any recipient creation fails, the batch should say no salary transfers were initiated.

Do not resubmit historical FAILED batches. Before LIVE payroll, preview with the company's LIVE secret key, confirm provider verification and balance/fees, disable Transfers OTP for bulk transfers in that company's Paystack Dashboard, and rely on webhook/verification before marking payments PAID.

## Paystack documentation

- Test payments and Nigerian test bank accounts: https://paystack.com/docs/payments/test-payments/
- Create transfer recipient: https://paystack.com/docs/api/transfer-recipient/
- How transfers work and test/live lifecycle: https://paystack.com/docs/transfers/how-transfers-work/
- Resolve account: https://paystack.com/docs/identity-verification/verify-account-number/
