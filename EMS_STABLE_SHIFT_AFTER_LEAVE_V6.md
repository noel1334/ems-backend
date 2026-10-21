# EMS Stable Shift After Leave V6 (backend)

## Behavior
- Each active employee is assigned a stable selected shift for the generated roster; ordinary days and weekly boundaries do not force a shift change.
- When shift rotation is enabled, an employee advances by one selected shift on the first day after a completed leave block.
- Both approved leave and automatically allocated leave are considered. Overlapping/adjacent leave intervals count as one continuous absence.
- The same rule works with two shifts, three shifts, or more selected shifts.
- The balancer intentionally does not move employees between shifts just to make daily headcounts equal. Leave can therefore make one shift temporarily understaffed; review coverage before approving/publishing.
- No Prisma schema migration is required.
- Existing generated drafts are not changed. Generate a new draft after deploying the backend patch.

## Apply in Termux
Download `ems-stable-shift-after-leave-v6-backend.zip` to `~/storage/downloads`, then run:

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-stable-shift-after-leave-v6-backend.zip -d .
node --check src/modules/scheduling/scheduling.service.js
node --check src/modules/scheduling/shift-balancer.js
node --check src/modules/scheduling/shift-rotation.js
npm test -- tests/unit/shift-balancer.test.js tests/unit/shift-rotation.test.js
 git diff --check
```

If the tests pass, stage only these patch files so unrelated local work is preserved:

```bash
git add src/modules/scheduling/scheduling.service.js src/modules/scheduling/shift-balancer.js src/modules/scheduling/shift-rotation.js tests/unit/shift-balancer.test.js tests/unit/shift-rotation.test.js EMS_STABLE_SHIFT_AFTER_LEAVE_V6.md
git diff --cached --check
git commit -m "fix: keep shift assignments stable until leave return"
git push origin main
```

Run the full suite before deployment:

```bash
npm test
```

## Operational note
Stable assignment prioritizes predictable shifts over equal headcounts. A department manager must review the generated draft and resolve coverage gaps before approval/publishing. This patch does not calculate legal rest-hour compliance; configure working days and shift start/end times responsibly.
