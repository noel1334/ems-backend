# EMS Scheduling Timetable V2 — patch notes

This patch addresses the flexible-scheduling draft editor and adds read-only published timetable views.

## What it changes

- Fixes draft editor change tracking so only real differences count as unsaved changes.
- Disables assignment inputs during save, provides an explicit save error message, and clears mutation errors on a fresh edit.
- Adds a department timetable with department selection, weekly/monthly range selection, desktop matrix and mobile cards.
- Adds “My schedule” to the employee self-service portal, showing only the signed-in employee’s published assignments.
- Adds backend endpoints for tenant-scoped department timetables and the authenticated employee’s own published schedule.
- Both timetable views use existing ScheduleGenerationAssignment rows from PUBLISHED generations. No new Prisma models or migration are introduced.

## Important behaviour

Drafts and approved-but-unpublished generations are not shown in the timetables. The employee endpoint accepts no employee ID from the client; it derives employee linkage from the authenticated principal and rechecks that linkage against the database. Department timetable requests are scoped to the selected tenant and department.

The source checks performed here were JavaScript syntax checks and TypeScript transpile/syntax checks. A full Vite build and backend Vitest run could not be performed in this environment because the working copies did not have the required build/test binaries installed. Run the normal build/tests below before pushing.

## Apply in Termux

Apply the backend before the frontend so the timetable APIs are available first. Download this ZIP into `~/storage/downloads`, then run:

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-scheduling-timetable-v2-backend.zip -d ~/work/ems-backend
node --check src/modules/scheduling/scheduling.service.js
node --check src/modules/scheduling/scheduling.controller.js
node --check src/modules/scheduling/scheduling.routes.js
node --check src/modules/platform/platform.scheduling.controller.js
node --check src/modules/platform/platform.routes.js
npm test
git diff --check
git status --short
git add src/modules/platform/platform.routes.js src/modules/platform/platform.scheduling.controller.js src/modules/scheduling/scheduling.controller.js src/modules/scheduling/scheduling.routes.js src/modules/scheduling/scheduling.service.js
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add published scheduling timetable APIs"
git fetch origin
git push origin HEAD:main
```

This patch adds no schema columns, so `prisma db push` is not required for these changes. Still follow your normal Render build/start procedure and verify the endpoints after deployment. Stop if tests fail or Git reports an unexpected change. Do not force-push.
