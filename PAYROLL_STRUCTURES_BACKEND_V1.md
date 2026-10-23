# EMS Payroll Structures Backend V1

This patch adds atomic template creation for a structure and its initial components, plus component update and soft-deactivation endpoints. It preserves company/tenant scoping by resolving the parent structure using both its ID and the authenticated company ID. Component rows are deactivated rather than physically deleted, preserving historical context.

## Apply in Termux

Extract this ZIP in the backend project root (the folder containing `package.json` and `src/modules/payroll`):

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-payroll-structures-backend-v1.zip -d .
node scripts/apply-payroll-structures-backend-v1.mjs
```

## Verify

```bash
node --check src/modules/payroll/payroll.service.js
node --check src/modules/payroll/payroll.controller.js
node --check src/modules/payroll/payroll.routes.js
node --check src/modules/payroll/payroll.validators.js
npm test -- tests/unit/payroll-structure-validation.test.js
npm run prisma:validate
```

No Prisma schema migration is expected: the supplied schema already includes `PayrollStructure` and `PayrollStructureComponent`. Prisma validation/generation may still be run as part of the deployment checks, and normal backend environment variables must be configured.

## API behavior

- `POST /payroll/structures` accepts an optional `components` array. Initial component rows are nested under the structure create, so the database operation succeeds or fails as a unit.
- `PATCH /payroll/structures/:structureId/components/:componentId` updates only a component belonging to that structure and tenant.
- `DELETE /payroll/structures/:structureId/components/:componentId` sets `isActive=false`; it does not physically delete the row.
- A component's `code` must be unique within its structure. Structure and component permissions use the existing payroll permission middleware.

After applying this patch, inspect `git diff --check` and `git status --short`. Commit and push the backend separately from the frontend; deploy the backend first.
