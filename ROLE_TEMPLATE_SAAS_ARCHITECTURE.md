# EMS SaaS role templates and tenant-owned role snapshots

## What this implementation changes

- Global role templates are stored separately from assignable tenant roles. Published versions are tracked independently; editing a draft does not change the currently published version.
- The migration bootstraps existing core role templates from seeded permissions, then gives each existing company its own `COMPANY_ADMIN`, `HR_ADMIN`, `FINANCE_ADMIN`, `EMPLOYEE` and `STORE_KEEPER` role snapshots. Existing role assignments are moved to the matching company-owned role.
- The seed initializes missing core templates and the built-in industry library (50 reusable templates across 20 industries). It never overwrites an existing published template version.
- New companies, normal company signup and the demo bootstrap create independent snapshots of the current published core templates. Company records never share editable role-permission rows.
- Super Admin Console includes a Role templates panel to create global templates, edit permission drafts and publish new versions. All template-write routes and the platform permission catalogue require a real platform `SUPER_ADMIN` account with no company assignment.
- Company administrators can create a company-owned role from a published industry/platform template. The role records its source template and version, but its permissions remain company-specific. Updates are always opt-in; publishing a global version never silently overwrites customer permissions.
- Company administrators can explicitly adopt a newer template version after seeing a warning. They may adopt only permissions delegated to their account, and company roles cannot receive platform-only permissions.
- RBAC reads and role assignments are scoped to the current company. A company user cannot use a global/shared or another company's role as a source of authority.
- Reserved core role names remain fixed to keep authorization and bootstrap workflows stable; administrators can customize those roles' permissions within their company or create a separately named custom role.
- Template creation, version publication, role creation from a template and explicit template adoption are audited.
- The company role editor opens an existing same-name role instead of creating a duplicate. Industry recommendations use the database-backed published template when it is available.

## Important files

- `prisma/schema.prisma`
- `prisma/migrations/20261015080000_versioned_role_templates_and_tenant_role_snapshots/migration.sql`
- `prisma/seed.js` and `src/modules/platform/role-template-definitions.js`
- `src/modules/platform/role-template.service.js` and `role-template.controller.js`
- `src/modules/platform/platform.routes.js`
- `src/modules/rbac/rbac.routes.js`, `rbac.repository.js`, `rbac.service.js` and `rbac.mapper.js`
- Frontend `src/features-workspaces.tsx`, `src/App.tsx` and `src/lib/api/endpoints/index.ts`

## Deployment and verification checklist

1. Back up Neon before applying the migration. Do not test a data-moving migration against the production database first.
2. Configure `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` securely for the controlled seed/bootstrap operation. Do not change the demo account to `SUPER_ADMIN`; `demo.admin@example.com` remains a tenant-scoped `COMPANY_ADMIN`.
3. Backend: install dependencies, run `npx prisma validate`, `npx prisma generate`, and `npx prisma migrate deploy` in that order. Then run `npx prisma db seed` after verifying the database backup.
4. Run the backend tests (`npm test`) and the frontend production build (`npm run build`).
5. Deploy the backend and frontend updates together after validation. Keep the database migration and frontend release coordinated.
6. Sign in with the dedicated Super Admin and verify the Role templates panel. A company administrator should receive 403 from `GET /api/v1/platform/role-templates` and must not be able to create, publish or edit global templates.
7. Create a template draft, publish a new version and verify new companies use the current core defaults. Existing company roles must remain unchanged until a company administrator deliberately applies an available update.
8. Create a role from an industry template in Company A, customize its permissions, and verify the resulting role is linked to the selected template version. Publish another version, then test opt-in adoption.
9. Test with two companies: edit a role in Company A and confirm Company B's equivalent role is unchanged. Test an attempted cross-tenant role assignment and a platform-only permission grant; both must be rejected.
10. Verify seed reruns preserve published template versions and do not remove company customizations.

## Scope and release notes

These ZIP files contain source changes and migration files. They do not modify the live Neon database or Render/Vercel deployments by themselves. Build, migration, and live multi-tenant verification must pass in a safe test environment before production rollout.
