# EMS Super Admin bootstrap recovery fix

## What this fixes

- The server startup now reports clearly when `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` are missing at runtime.
- A newly configured platform administrator is created with no company (`companyId = null`) and receives the global `SUPER_ADMIN` role.
- If the platform user already exists but login fails, set `SUPER_ADMIN_RESET_PASSWORD=true` temporarily. Startup and Prisma seed will set the configured password, activate and verify the account, clear failed-login lockout fields, and ensure the Super Admin role is attached.
- The code refuses to use an email that belongs to an existing company user. It does not promote a company admin into platform admin.
- Seed logs whether the account was created, restored, skipped because the variables were absent, or blocked by an email conflict.

## Render recovery steps

In Render > EMS backend service > Environment, set:

- `SUPER_ADMIN_EMAIL=admin@example.com` (only if this email is not already a company user's email)
- `SUPER_ADMIN_PASSWORD=<a strong password you choose>`
- `SUPER_ADMIN_RESET_PASSWORD=true` (temporary recovery flag)
- `BOOTSTRAP_DEMO_DATA=false`
- `ALLOW_DEMO_BOOTSTRAP_IN_PRODUCTION=false`

Keep `DATABASE_URL`, JWT secrets, and all other existing settings unchanged. Save and redeploy.

In the logs, look for one of these success messages:

- `Platform administrator created from SUPER_ADMIN_EMAIL: ...`
- `Platform administrator password reset and account unlocked: ...`
- `Platform Super Admin role verified: ...`

If the logs say the email is already used by a company account, configure a different platform-admin email. Do not change or delete the existing company account.

After you successfully sign in with the platform account, set `SUPER_ADMIN_RESET_PASSWORD=false` (or remove it) and redeploy. This stops future restarts from resetting the password. Keep `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` configured if you want the account/role to be reattached automatically during recovery.

Do not paste the password, database URL, or JWT secrets into chat or logs.
