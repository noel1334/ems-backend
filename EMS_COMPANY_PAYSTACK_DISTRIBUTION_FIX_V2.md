# V2 deployment note — superseded by V3

V2 enabled Paystack `/bank/resolve` by default for every employee in TEST mode. The Project screenshot uploaded on 4 November 2026 shows that this exhausted Paystack's TEST-mode daily allowance of three real-bank lookups.

**Do not follow the old V2 instruction to set `PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=true`.** V3 changes the default to `false`, skips bank resolution in TEST mode, and performs recipient creation for all employees before initiating simulated test transfers. LIVE mode always requires bank resolution.

Use `EMS_COMPANY_PAYSTACK_DISTRIBUTION_FIX_V3.md` and `EMS_COMPANY_PAYSTACK_DISTRIBUTION_FIX_V3_README.md` as the current instructions.
