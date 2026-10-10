# Stage 26 — HR/Admin Operations Dashboard Backend

Tenant-scoped dashboard aggregation APIs for HR/admin operations.

- GET /api/v1/dashboard/overview
- GET /api/v1/dashboard/attendance?from=&to=&departmentId=
- GET /api/v1/dashboard/leave
- GET /api/v1/dashboard/payroll?year=&month=
- GET /api/v1/dashboard/devices

Company context is always derived from the authenticated user. Existing RBAC middleware protects each route. Device online status is a five-minute heuristic based on authenticated credential use; manufacturer health telemetry can be added later.
