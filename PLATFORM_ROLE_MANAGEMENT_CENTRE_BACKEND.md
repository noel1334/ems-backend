# Platform Role Management Centre — backend patch

This patch extends the existing protected platform role-management APIs without changing ordinary tenant RBAC routes.

## Changes

- Company-role listing now includes inactive roles so a platform Super Admin can reactivate a role after it has been deactivated.
- Company-role payloads expose `sourceTemplateId`, `sourceTemplateVersion`, and `assignmentCount` for the management interface.
- Platform-created company roles can optionally reference a published platform role template. The company role remains a tenant-owned snapshot; publishing future template versions does not update it automatically.
- Source template ID is checked against an active template with a published version before it is recorded.
- Existing Super Admin route middleware remains in place, and role permission validation still rejects platform-only permissions for tenant roles.
- Role changes continue to use the existing audit-writing path.

## Routes used

- `GET /api/v1/platform/role-templates`
- `POST /api/v1/platform/role-templates`
- `POST /api/v1/platform/role-templates/:id/versions`
- `GET /api/v1/platform/permissions`
- `GET /api/v1/platform/tenants/:id/roles`
- `POST /api/v1/platform/tenants/:id/roles`
- `PATCH /api/v1/platform/tenants/:id/roles/:roleId`
- `GET /api/v1/platform/audit`

The platform role routes are already mounted behind authentication and Super Admin authorization in the existing backend source.

## Safety note

No `DELETE` endpoint is added by this patch. The UI offers activation/deactivation for custom company roles and protects system roles. A hard delete should only be added with an explicit relationship/assignment policy and tested safeguards.
