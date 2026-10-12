# Users and Employees CRUD integration fixes

This change aligns the current backend contracts with the EMS frontend.

## Employees
- Employee responses now include scalar `departmentId`, `designationId`, `managerId`, `maritalStatus`, `profilePhotoUrl`, and the optional `userId` relationship identifier while preserving the nested department/designation/manager summaries.
- Employee create/update validation accepts `maritalStatus`, and employee creation persists it.
- Employee number generation remains backend-controlled; clients must not submit an employee number. The sequence SQL uses text IDs to match the Prisma schema and initial PostgreSQL migration, which define these identifiers as `TEXT` rather than PostgreSQL `UUID` columns.

## Users
- User response objects include `employeeId` and `roleIds` in addition to role details.
- User creation and update accept an optional `employeeId` to link a company-scoped employee profile.
- The service validates that the employee belongs to the same company and is not already linked to a different account.
- User update operations run through a transaction, and disabling/suspending an account revokes its active sessions.
- Email remains read-only on ordinary user edits; account email changes should use a verified email-change flow.

No Prisma schema change is introduced by this patch. Deploy using the current development build command; do not reset the database.
