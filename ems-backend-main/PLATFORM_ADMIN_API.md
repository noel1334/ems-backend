# EMS Platform / Super Admin API

`SUPER_ADMIN` is a system-scoped role with `companyId = null`.

Endpoints are protected by `requireSuperAdmin` and are intentionally not behind tenant middleware:

- `GET /api/v1/platform/tenants`
- `POST /api/v1/platform/tenants`
- `GET /api/v1/platform/tenants/:id`
- `PATCH /api/v1/platform/tenants/:id`
- `GET /api/v1/platform/audit`

A tenant creation transaction creates the company, its initial `COMPANY_ADMIN`, and the role assignment atomically.

To create the first platform administrator during `prisma db seed`, provide:

```env
SUPER_ADMIN_EMAIL=platform-admin@example.com
SUPER_ADMIN_PASSWORD=use-a-long-random-password
```

The platform administrator is deliberately not attached to a company. Company RBAC cannot assign `SUPER_ADMIN`.
