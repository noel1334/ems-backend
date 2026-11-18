EMS backend migration recovery patch

This ZIP is based on the uploaded current backend source. It changes only the six global role-permission INSERT statements in:
prisma/migrations/20261012090000_expand_tenant_permission_catalog/migration.sql

Each INSERT now selects from a named CTE with explicit role_id and permission_id aliases. The permission predicates, ON CONFLICT target, permission upsert, and scoped DELETE are preserved. No database operation is performed by extracting this ZIP.

IMPORTANT: Because Neon already records this migration as failed, replacing the source file alone will not clear Prisma's failed-migration state. Do not run migrate deploy until the failed migration has been safely marked rolled back using Prisma's documented recovery process, after confirming the partial effects are understood. Do not reset the database.
