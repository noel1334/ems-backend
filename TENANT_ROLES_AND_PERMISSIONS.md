# Tenant-specific roles and permissions

This implementation builds on the existing Prisma `Role`, `Permission`, and `RolePermission` models. Tenant-specific roles do not require new Prisma models because `roles.companyId` and role-permission relationships already exist. Two safe SQL migrations are included: one adds/assigns missing permissions referenced by existing API routes, and one repairs a missing `employees.employeeNumber` column on databases with schema drift.

## Model

- The permission catalogue is global and maintained in `prisma/seed.js` by the EMS platform. The catalogue now includes permission keys referenced by the existing route guards, including `dashboard.dashboard.READ`.
- Seeded roles stay global templates (`companyId = null`, `scope = COMPANY`). The platform `SUPER_ADMIN` role is protected and has `scope = SYSTEM`.
- A custom role is stored with its owning tenant's `companyId`, `scope = COMPANY`, and `isSystem = false`.
- Custom roles can use only active permissions from the central catalogue. Platform settings and tenant create/delete permissions cannot be assigned to company roles.
- Company administrators can grant only permissions present in their own active company roles. They cannot assign platform-only roles, roles from another company, or permissions they do not hold.
- A custom role's name may repeat in another company without sharing its role permissions.

## Platform Super Admin endpoints

All endpoints require the authenticated platform `SUPER_ADMIN` account.

- `GET /api/v1/platform/permissions?page=1&limit=200` — active central catalogue permissions which are suitable for company roles.
- `GET /api/v1/platform/tenants/:id/roles` — global company-role templates plus this tenant's active custom roles, including assigned permissions.
- `POST /api/v1/platform/tenants/:id/roles` — create a tenant-specific role.
- `PATCH /api/v1/platform/tenants/:id/roles/:roleId` — update the name, description, active state, and/or complete `permissionIds` assignment of a custom role owned by that tenant. Send `permissionIds` only when replacing the set of permissions.

Create example:

```json
{
  "name": "Nursing Manager",
  "description": "Manages nursing staff and assigned leave requests",
  "permissionIds": ["<permission-uuid-1>", "<permission-uuid-2>"]
}
```

## Company administrator endpoints

The existing `/api/v1/rbac/roles` and `/api/v1/rbac/permissions` routes remain available. The permissions endpoint returns only permissions the signed-in company user is allowed to delegate. Tenant role CRUD never exposes `scope = SYSTEM` roles.

## Related runtime fixes included

- Employee-number SQL now selects the current tenant's employee numbers from `employees` rather than referencing a column without a `FROM` clause.
- Scheduling policy and generation pagination convert query-string `page`/`limit` values to integers and cap `limit` at 200.
- Zod validation errors include field-level summaries in the API response, so an invalid user-create request is more informative than a bare `Validation failed` toast.
- Platform department and designation lookups and employee profile assignment are included from the preceding backend fix.

## Deployment notes

1. Deploy the backend code as usual.
2. Ensure the Render start/release process runs `npx prisma migrate deploy` before serving traffic. The included migrations add missing permission rows, rebuild grants for the six global system roles, and repair `employees.employeeNumber` only where missing. They do not modify tenant-owned custom roles.
3. If your deployment does not run migrations automatically, run `npx prisma migrate deploy` once against the intended Neon database before testing.
4. `prisma/seed.js` is updated to keep the permission catalogue and global role grants aligned on future seed runs. Do not run the seed against production until the configured database target is verified.
5. Run `npm test` to verify the unit tests after dependencies are installed; a full production database integration test has not been run as part of this ZIP preparation.

## Permission boundary and current scope

This release implements module/resource/action grants plus tenant ownership checks. Fine-grained record scopes such as `OWN_RECORDS`, `ASSIGNED_DEPARTMENT`, and `ENTIRE_COMPANY` are not yet represented on each role-permission assignment; those require a separate data-scope design and must be enforced inside the affected services, not just in middleware.

## Suggested Render commands

- Build command: `npm ci && npx prisma generate && npx prisma migrate deploy`
- Start command: `npm start`

The migration command must target the intended database. Confirm `DATABASE_URL` points to the correct Neon database before the deployment runs migrations.
