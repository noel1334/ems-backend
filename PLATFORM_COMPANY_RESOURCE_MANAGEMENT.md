# Platform Super Admin company resource management

The companyless platform Super Admin must not call normal company-scoped APIs without a tenant context. Employee, department, and designation list/create/read/update/delete operations for the platform owner are exposed under the protected routes:

- `/api/v1/platform/tenants/:id/employees`
- `/api/v1/platform/tenants/:id/departments`
- `/api/v1/platform/tenants/:id/designations`

All routes are mounted behind `authMiddleware` and `requireSuperAdmin`. Each handler resolves the target company from the URL and passes that company ID to the existing tenant-scoped service layer. The ordinary company routes and `tenantMiddleware` remain strict; the platform fix does not allow a request body or query string to silently switch tenant scope.

Department and designation list requests include inactive records so the platform owner can reactivate them. Use `PATCH` with `{ "isActive": false }` to deactivate and `{ "isActive": true }` to reactivate. Employee status can be changed through `PATCH` using `employmentStatus: "INACTIVE"` or `"ACTIVE"`. Deletion remains subject to existing service/relation safeguards.
