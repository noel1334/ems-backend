# EMS Monnify Payroll Recovery Patch (v2)

This patch overlays the existing EMS backend. It is not a full backend source archive.

Included:
- Monnify batch submission/OTP diagnostics and safe recovery changes
- Rejection-only single-transfer fallback guard
- Payroll funding-route guard
- Focused recovery verifier
- Updated `scripts/verify-monnify-payroll-automation.mjs` that checks the documented resend path `/api/v2/disbursements/single/resend-otp`

Apply by copying the patch files over the matching files in the backend repository, preserving unrelated files. Run both verification scripts and the focused payroll funding-route test before committing.

Do not retry a salary batch or individual transfer while its Monnify outcome is unknown. Reconcile the provider reference first. Never reset or reseed the database to apply this patch.
