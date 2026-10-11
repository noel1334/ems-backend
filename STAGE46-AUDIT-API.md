# Backend Stage 46 — Tenant Audit API

Adds a tenant-scoped read/export API for existing `AuditLog` records.

## Routes

- `GET /api/v1/audit-logs` — paginated filtered audit records; `audit:audit:READ`
- `GET /api/v1/audit-logs/:id` — one audit record; `audit:audit:READ`
- `GET /api/v1/audit-logs/export` — CSV export; `audit:audit:EXPORT`

Filters: `page`, `limit`, `action`, `module`, `resource`, `userId`, `resourceId`, `from`, `to`, `search`.

## Security

Every query is scoped by the authenticated user's `companyId` and protected by the existing permission middleware. The audit model now persists the request ID already supplied by the existing audit writer, and the writer now persists the module field passed by existing audit callers.

The seed adds READ/EXPORT audit permissions and includes them in company-admin and HR-admin permission sets.
