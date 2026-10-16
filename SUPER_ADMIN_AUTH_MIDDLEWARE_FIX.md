# EMS Super Admin authentication middleware fix

## Root cause

`src/middleware/auth.middleware.js` used this condition:

```js
!Array.isArray(payload.roles)?.includes("SUPER_ADMIN")
```

Because the negation applies to `Array.isArray(...)` before `.includes(...)`, the code tries to call `.includes()` on a boolean for a company-less Super Admin token. That throws a `TypeError`. The middleware catches it and reports `Invalid or expired access token`, even when the JWT is valid. Company accounts usually did not hit the broken expression because their non-empty `companyId` short-circuited the condition.

## Fix

The middleware now delegates the check to `hasValidTenantContext()` in `src/middleware/auth-token-policy.js`. A company-less access token is accepted by this initial middleware only when its role claim explicitly includes `SUPER_ADMIN`. Platform endpoints must continue to use `requireSuperAdmin`, which checks the active system role against the database and requires `companyId === null`.

This keeps tenant restrictions in place; it does not grant company access to platform users.

## Apply

Overlay the ZIP into the existing backend repository. It does not replace `auth.service.js` and therefore preserves the previously committed refresh-session fix.

Run:

```bash
node --check src/middleware/auth.middleware.js
node --check src/middleware/auth-token-policy.js
npm test -- tests/unit/auth-token-policy.test.js tests/security/super-admin-refresh.security.test.js tests/security/role-separation.security.test.js
```

Commit and push only if the tests pass. Confirm Render deploys the resulting commit before retesting the website.
