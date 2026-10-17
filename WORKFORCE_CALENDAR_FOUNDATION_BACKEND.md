# EMS Workforce Calendar Foundation — Backend

This patch connects shifts, shift breaks, weekly work schedules, employee schedule/shift assignments, holidays, and saved scheduling-generation records to the existing backend services.

## Platform Super Admin

The protected `/api/v1/platform/tenants/:id/...` routes require the existing `authenticate` and `requireSuperAdmin` middleware. Each controller request verifies the explicitly selected company using `platformService.getTenant` and then calls the existing tenant-scoped service. Ordinary tenant APIs and their middleware are not changed.

Supported platform routes include:

- `GET/POST /platform/tenants/:id/shifts`, `GET/PATCH/DELETE /platform/tenants/:id/shifts/:resourceId`, and shift-break create/update/delete routes.
- `GET/POST /platform/tenants/:id/schedules`, schedule read/update/delete and replace-days routes, plus employee schedule and shift assignments.
- `GET/POST /platform/tenants/:id/holidays` and holiday read/update/delete routes.
- `GET /platform/tenants/:id/scheduling/generations` and generation detail.

Writes are recorded in the platform audit log. Existing service safeguards continue to control invalid or in-use deletions.

## Holiday type schema repair

The existing holiday service already accepts a `holidayType`, but the source Prisma `Holiday` model did not declare it. The included patch helper adds the `HolidayType` enum and `holidayType` field without replacing the user's schema. The additive migration supplies a default `COMPANY` type for existing rows.

## Applying this patch

From the backend repository root, run:

```bash
node apply-workforce-calendar-backend-patch.mjs
node --check src/modules/platform/platform.workforce.controller.js
node --check src/modules/platform/platform.routes.js
```

Then generate Prisma Client and apply migrations before testing the holiday API:

```bash
npm run prisma:generate
npm run prisma:deploy
```

On Render, ensure the build/deploy workflow runs `npm run prisma:generate` and `npm run prisma:deploy` using the service's configured database environment before the new API is used. Do not point these commands at a different database from the deployed application.
