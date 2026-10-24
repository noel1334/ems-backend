# EMS Stable Shift Rotation V5

Incremental backend patch for `ems-backend`. It keeps an employee on a stable shift for a weekly block by default, or a 14-day block when the saved policy's `rotationDays` is 14 or greater. This prevents daily day/night switching. When an employee completes their automatic-leave block, their preferred shift advances by one shift so, for example, a night worker can return on morning shift.

The daily balancing algorithm still balances available headcounts as closely as possible. Consecutive nights are allowed within a rotation block; therefore ensure the policy's working-day/rest-day pattern provides appropriate recovery time after night shifts. This patch changes newly generated drafts only; regenerate, review, approve and publish to apply it.

## Apply in Termux

```bash
cd ~/work/ems-backend
unzip -o ~/storage/downloads/ems-stable-shift-rotation-v5-backend.zip -d .
node --check src/modules/scheduling/scheduling.service.js
npm test -- tests/unit/shift-balancer.test.js
git diff --check
git add src/modules/scheduling/scheduling.service.js
git diff --cached --check
git diff --cached --stat
git commit -m "fix: keep shift assignments stable across rotation blocks"
git push origin HEAD
```

Run the full test suite with `npm test` before deploying. No schema migration is required.
