# Super Admin session refresh fix

## Root cause

The login endpoint can successfully authenticate a platform Super Admin whose `companyId` is `null`. However, the refresh-token service unconditionally rejected any session whose user did not have a company. The frontend automatically refreshes after a protected request returns HTTP 401; the refresh endpoint then rejected the valid company-less platform account and cleared both authentication cookies. The frontend consequently cleared the session and returned to the login screen.

## Change

The refresh flow now permits a company-less session only when all of the following are true:

- both the persisted user's `companyId` and the session's `companyId` are `null`;
- the account has an active `SUPER_ADMIN` role with `SYSTEM` scope, verified from the database.

Company users still require an existing active company. This does not grant platform access based only on a null `companyId` and does not change permissions or role assignments.

## Validation

Run:

```bash
node --check src/modules/auth/auth.service.js
npm test -- --run tests/security/super-admin-refresh.security.test.js tests/security/role-separation.security.test.js
```

After deploying, log in as the platform Super Admin and verify that the Super Admin Console remains open. Existing company-user logins should continue working normally.
