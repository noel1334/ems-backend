# Industry Role Templates: Backend Requirements

This change adds the company `industry` field to Prisma and exposes it in company and platform tenant responses. Allowed values are `HEALTHCARE`, `MANUFACTURING`, `EDUCATION`, `CONSTRUCTION`, `HOSPITALITY`, `RETAIL`, `LOGISTICS`, `FINANCE`, `NGO`, `CORPORATE`, and `OTHER`.

The frontend requests company role and permission data from the existing tenant-scoped RBAC APIs. The backend remains authoritative for tenant scoping, permission assignment, reserved system roles, and authorization. Authentication role serialization includes active permission catalogue fields so the frontend can reflect custom-role permissions after sign-in/refresh.

## Database development deployment

The new nullable column can be synchronized in this development environment with:

```bash
npx prisma generate
npx prisma db push
```

The accompanying additive migration uses `ADD COLUMN IF NOT EXISTS`, so the industry column migration itself is safe if the column already exists. However, the current repository also has an earlier `20261012090000_expand_tenant_permission_catalog` migration that failed on the development Neon database. `db push` synchronizes the schema but does not repair that migration history. Before using `migrate deploy` on a fresh production database, run the full migration chain on a disposable database and resolve any migration errors. Do not use `db push` as a replacement for reviewed migrations in production.

## Validation performed on this source bundle

- `node --check` passed for the edited backend JavaScript files.
- Frontend TypeScript/TSX files passed syntax transpilation.
- The focused TypeScript type check for the industry and template catalogue passed.
- A full frontend install/build and live Render/Neon integration test were not completed in this environment; test those after applying the bundle.
