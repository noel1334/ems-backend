# EMS Scheduling / Timetable V3 — backend patch

## Fixes

- Gives schedule generation, draft assignment updates, and publishing explicit interactive-transaction timeouts (30 seconds) and bounded retries for Prisma serializable write conflicts (`P2034`).
- Batches published employee shift-interval inserts with `createMany` instead of awaiting a separate insert for every interval. Large rotating schedules could otherwise exceed Prisma's default interactive transaction timeout.
- Returns more actionable messages for common database transaction, reference, and schema errors instead of collapsing them all into `Database operation failed`.
- Logs safe Prisma diagnostic metadata (`requestId`, endpoint, error code and Prisma metadata) on the backend, including production, without logging request bodies or secrets.
- Keeps tenant-scoped routes and current schema models; no Prisma schema change or migration is introduced.

## Apply in Termux

Download this ZIP into `~/storage/downloads`. Apply it to the existing backend repository:

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-scheduling-timetable-v3-backend.zip -d .
node --check src/common/errors/error.middleware.js
node --check src/modules/platform/platform.routes.js
node --check src/modules/platform/platform.scheduling.controller.js
node --check src/modules/scheduling/scheduling.controller.js
node --check src/modules/scheduling/scheduling.routes.js
node --check src/modules/scheduling/scheduling.service.js
node --check src/modules/scheduling/scheduling.draft.service.js
npm test
git diff --check
git status --short
git add src/common/errors/error.middleware.js src/modules/platform/platform.routes.js src/modules/platform/platform.scheduling.controller.js src/modules/scheduling/scheduling.controller.js src/modules/scheduling/scheduling.routes.js src/modules/scheduling/scheduling.service.js src/modules/scheduling/scheduling.draft.service.js
git diff --cached --check
git diff --cached --stat
git commit -m "fix: schedule publish transactions and database diagnostics"
git fetch origin
git push origin HEAD:main
```

Stop if syntax checks or tests fail, or if Git reports unrelated changes. Do not force-push. Deploy the updated backend to Render and verify the routes after deployment. No `prisma db push` is required because the Prisma schema did not change.
