# Stage 11 integration

1. Add `prisma/leave-schema.prisma.txt` to the existing `prisma/schema.prisma` and add the listed relations to Company and Employee.
2. Add to existing `src/route/index.js`:

```js
import leaveRoutes from '../modules/leave/leave.routes.js';
router.use('/leave', leaveRoutes);
```

Do NOT mount leave routes directly in app.js.

3. If the existing RBAC seed has `(module, resource, action)` permissions, add:

- leave / types / READ, CREATE, UPDATE, DELETE
- leave / entitlements / READ, MANAGE
- leave / requests / READ, CREATE, UPDATE, APPROVE
- leave / reports / READ

4. Run:

```bash
npx prisma format
npx prisma validate
npx prisma migrate dev --name add_leave_management
npx prisma generate
npm test
npm run lint
```

5. Optional default leave types are in `src/modules/leave/leave.constants.js`. They are examples and should be adjusted to the company's policy/applicable law.

## Attendance integration

Stage 10's absence-generation logic must skip an absence when approved leave exists. Import:

```js
import { isEmployeeOnApprovedLeave } from '../leave/leave.service.js';
```

Then, before creating an ABSENT record:

```js
const leave = await isEmployeeOnApprovedLeave(companyId, employeeId, workDate, tx);
if (leave) {
  // classify the day as LEAVE in the attendance reporting layer
  // and do not create an ABSENT record.
}
```

The exact Stage 10 attendance service is intentionally not overwritten because the current workspace does not contain the source tree. This is the only Stage 10 integration point required by Stage 11.

## Git checkpoint

```bash
git checkout -b stage-11-leave-management
npx prisma format
npx prisma validate
npx prisma migrate dev --name add_leave_management
npx prisma generate
npm test
npm run lint
git add .
git commit -m "feat(leave): implement leave management"
git push -u origin stage-11-leave-management
```
