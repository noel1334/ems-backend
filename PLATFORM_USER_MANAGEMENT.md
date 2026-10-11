# Super Admin platform user management API

This patch adds tenant-scoped user administration under the existing authenticated `/api/v1/platform` router. Every route in that router remains protected by `authenticate` and `requireSuperAdmin`.

## Endpoints

- `GET /api/v1/platform/tenants/:id/roles` — lists active company-scoped roles available for the chosen tenant; excludes `SUPER_ADMIN`.
- `GET /api/v1/platform/tenants/:id/users?page=1&limit=100` — lists users and assigned role names for a chosen tenant.
- `POST /api/v1/platform/tenants/:id/users` — creates a company user and assigns one or more company-scoped roles.
- `PATCH /api/v1/platform/tenants/:id/users/:userId` — updates a user's status and revokes active sessions when the account is not ACTIVE.

Example create payload:

```json
{
  "email": "employee@example.com",
  "password": "Use-a-strong-temporary-password",
  "firstName": "Amina",
  "lastName": "Bello",
  "phone": "+2348000000000",
  "jobTitle": "Accountant",
  "employeeType": "FULL_TIME",
  "roleIds": ["UUID-OF-A-COMPANY-ROLE"]
}
```

When a selected role is `EMPLOYEE`, the service also creates an employee profile and links it to the account. Credentials are hashed; passwords are never returned. A platform audit event is written for user creation and status changes. `SUPER_ADMIN` cannot be assigned to a company-scoped user.

## Deployment

No database schema migration is introduced. The service depends on existing `User`, `Employee`, `Role`, `UserRole`, `UserSession`, and `AuditLog` models and the seeded company role definitions. Run the existing seed successfully so roles such as `COMPANY_ADMIN`, `HR_ADMIN`, `FINANCE_ADMIN`, `EMPLOYEE`, and `STORE_KEEPER` exist before using the frontend role picker.

Deploy to a staging service first. The frontend patch expects these routes to exist before using the Super Admin **Users** tab.
