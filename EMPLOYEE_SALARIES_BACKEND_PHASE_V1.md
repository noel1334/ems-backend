# EMS Employee Salaries — Backend Phase V1

This patch adds database-backed employee salary listing, effective-dated salary assignments, employee-specific payroll component overrides, and salary activation/deactivation. It also wires permanent payroll-structure deletion with an important safeguard: a structure is not physically deleted when any employee salary assignment refers to it, including inactive historical assignments.

## Files

- Payroll validators, service, controller, routes, and mapper.
- `EmployeeSalary.componentOverrides` as nullable JSONB.
- A Prisma migration that adds the JSONB column.
- Unit tests for salary request validation.

## Apply

Extract the ZIP into the existing EMS backend root, then run:

```bash
node scripts/apply-employee-salaries-phase-v1.mjs
node --check src/modules/payroll/payroll.service.js
node --check src/modules/payroll/payroll.controller.js
node --check src/modules/payroll/payroll.routes.js
node --check src/modules/payroll/payroll.validators.js
npm test -- tests/unit/payroll-employee-salaries.test.js
npm run prisma:validate
```

The apply script backs up each target file before replacing it. The snapshot includes the Express 5 query-validation fix required by the existing Payroll Structures list endpoint.

## Database migration

This phase adds `componentOverrides` to the existing `employee_salaries` table. Run the committed migration using your normal deployment migration command (`npm run prisma:deploy`) before using employee-specific component overrides. Then regenerate Prisma Client as part of the backend build/deploy if your deployment does not already run `prisma generate`.

Do not use `prisma db push` as a substitute for the committed production migration on a live database.

## Important behaviour

- Salary listing is scoped to the authenticated company and supports search, status, employee, structure, and department filters.
- A salary change creates a new effective-dated salary assignment so older salary/payroll history remains available.
- Individual override values are stored on the employee salary assignment and applied by the payroll calculator without altering the shared payroll structure.
- A component can be excluded for a particular employee without deactivating it for everyone using the structure.
- Permanent structure deletion is allowed only when no salary assignments refer to it; the backend returns a conflict otherwise. Deactivate it instead to preserve history.
- Reactivation of a salary assignment is rejected if its dates overlap another active salary assignment for that employee.
