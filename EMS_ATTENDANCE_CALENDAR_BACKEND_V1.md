# EMS Attendance Calendar — Backend V1

Adds a tenant-scoped read-only endpoint:

`GET /schedules/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&employeeId=<uuid>]`

It returns:
- active employee schedule assignments and their weekly shift pattern;
- direct employee shift assignments;
- assignments from published flexible timetables only;
- active holidays, including recurring holidays;
- attendance totals grouped by attendance date and status;
- detailed month-range attendance for the selected employee, when `employeeId` is supplied.

## SaaS safeguards
- Company scope comes from the authenticated request, not a client-supplied tenant ID.
- The route uses the existing `schedules:schedule:READ` permission.
- Date format is validated and a request is limited to 62 days.
- This change requires no Prisma schema migration.

## Apply in Termux
Download `ems-attendance-calendar-backend-v1.zip` to the phone's Downloads folder, then run from the backend repository root:

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-attendance-calendar-backend-v1.zip -d .
node scripts/apply-attendance-calendar-backend-v1.mjs
node --check src/modules/schedules/schedule.repository.js
node --check src/modules/schedules/schedule.service.js
node --check src/modules/schedules/schedule.controller.js
node --check src/modules/schedules/schedule.routes.js
git diff --check
git diff -- src/modules/schedules/schedule.repository.js src/modules/schedules/schedule.service.js src/modules/schedules/schedule.controller.js src/modules/schedules/schedule.routes.js
```

After verifying the diff:

```bash
git add src/modules/schedules/schedule.repository.js src/modules/schedules/schedule.service.js src/modules/schedules/schedule.controller.js src/modules/schedules/schedule.routes.js
git diff --cached --check
npm test
git commit -m "feat: expose attendance calendar schedule data"
git push origin main
```

Deploy the backend first and wait for its deployment to finish. Then apply, build and deploy the frontend patch.
