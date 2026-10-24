# EMS Automatic Leave + Fair Shift Allocation V4

This is an incremental patch for the existing EMS backend. It preserves the current automatic-leave grouping, approved-leave rules, employee-day rows, shift policy, and publish flow while improving how working employees are assigned to shifts after leave/rest/holiday statuses are known.

## Scheduling behaviour

- Keeps the policy's normal rotation as the preferred shift allocation.
- Rebalances the employees who are actually working on each date so shift headcounts differ by at most one wherever the configured constraints permit.
- With five available employees on two shifts, the normal split is 3/2. If one employee is on leave and four are available, it becomes 2/2. If there are three available employees across two shifts, it becomes 2/1.
- Uses each employee's assignment history as a fairness tie-breaker so the same people are not always moved to cover another shift.
- Applies the `preventConsecutiveNightShifts` rule before filling night-shift quotas when a non-night shift is available.
- Adds focused unit tests for even/odd teams, absences from either preferred shift, consecutive-night protection, and more shifts than workers.

## Apply from Termux

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-auto-leave-shift-balance-v4-backend.zip -d .
node --check src/modules/scheduling/scheduling.service.js
node --check src/modules/scheduling/shift-balancer.js
npm test -- tests/unit/shift-balancer.test.js
git diff --check
git add src/modules/scheduling/scheduling.service.js src/modules/scheduling/shift-balancer.js tests/unit/shift-balancer.test.js
git diff --cached --check
git diff --cached --stat
git commit -m "feat: balance shift staffing around automatic leave"
git push origin HEAD
```

After the focused test passes, run the full backend suite with `npm test`. A schedule already generated as a draft is not recalculated by this patch: generate a new draft to see the new allocation, review it, approve it and then publish it. The new allocation takes effect only for newly generated schedules.
