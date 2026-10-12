-- Adds permissions already referenced by EMS API route guards and repairs
-- the seeded global role grants. Safe to re-run because permission keys are unique.
INSERT INTO "permissions" ("id", "module", "resource", "action", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'dashboard', 'dashboard', 'READ'::"PermissionAction", 'View dashboard overview', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'employees', 'employee-profile', 'READ'::"PermissionAction", 'View employee profile', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'employees', 'employee-profile', 'UPDATE'::"PermissionAction", 'Update employee profile', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'holidays', 'holiday', 'CREATE'::"PermissionAction", 'Create company holidays', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'holidays', 'holiday', 'DELETE'::"PermissionAction", 'Delete company holidays', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'holidays', 'holiday', 'READ'::"PermissionAction", 'View company holidays', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'holidays', 'holiday', 'UPDATE'::"PermissionAction", 'Update company holidays', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'entitlements', 'MANAGE'::"PermissionAction", 'Manage leave entitlements', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'entitlements', 'READ'::"PermissionAction", 'View leave entitlements', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'reports', 'READ'::"PermissionAction", 'View leave reports', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'requests', 'APPROVE'::"PermissionAction", 'Approve or reject leave requests', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'requests', 'CREATE'::"PermissionAction", 'Create leave requests', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'requests', 'READ'::"PermissionAction", 'View leave requests', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'requests', 'UPDATE'::"PermissionAction", 'Update leave requests', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'types', 'CREATE'::"PermissionAction", 'Create leave types', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'types', 'DELETE'::"PermissionAction", 'Delete leave types', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'types', 'READ'::"PermissionAction", 'View leave types', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'leave', 'types', 'UPDATE'::"PermissionAction", 'Update leave types', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'payslips', 'READ'::"PermissionAction", 'View payslips', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'runs', 'APPROVE'::"PermissionAction", 'Approve payroll runs', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'runs', 'CREATE'::"PermissionAction", 'Create payroll runs', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'runs', 'READ'::"PermissionAction", 'View payroll runs', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'runs', 'UPDATE'::"PermissionAction", 'Update payroll runs', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'salaries', 'CREATE'::"PermissionAction", 'Create employee salary records', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'structures', 'CREATE'::"PermissionAction", 'Create payroll structures', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'structures', 'DELETE'::"PermissionAction", 'Delete payroll structures', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'structures', 'READ'::"PermissionAction", 'View payroll structures', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'structures', 'UPDATE'::"PermissionAction", 'Update payroll structures', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'rbac', 'roles', 'MANAGE'::"PermissionAction", 'Manage roles and role permissions', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'rbac', 'user-roles', 'MANAGE'::"PermissionAction", 'Assign and remove user roles', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'reports', 'reports', 'EXPORT'::"PermissionAction", 'Export company reports', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'reports', 'reports', 'READ'::"PermissionAction", 'View company reports', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'schedules', 'schedule', 'CREATE'::"PermissionAction", 'Create schedules', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'schedules', 'schedule', 'DELETE'::"PermissionAction", 'Delete schedules', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'schedules', 'schedule', 'READ'::"PermissionAction", 'View schedules', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'schedules', 'schedule', 'UPDATE'::"PermissionAction", 'Update schedules', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'shifts', 'shift', 'CREATE'::"PermissionAction", 'Create shifts', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'shifts', 'shift', 'DELETE'::"PermissionAction", 'Delete shifts', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'shifts', 'shift', 'READ'::"PermissionAction", 'View shifts', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'shifts', 'shift', 'UPDATE'::"PermissionAction", 'Update shifts', true, NOW(), NOW())
ON CONFLICT ("module", "resource", "action") DO UPDATE SET
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = NOW();

-- Reset only the six global system-role grants. Custom tenant roles are untouched.
DELETE FROM "role_permissions" rp
USING "roles" r
WHERE rp."roleId" = r."id"
  AND r."companyId" IS NULL
  AND r."isSystem" = true
  AND r."name" IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'FINANCE_ADMIN', 'EMPLOYEE', 'STORE_KEEPER');

-- SUPER_ADMIN receives the full active catalogue, including platform-only permissions.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'SUPER_ADMIN' AND p."isActive" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Company administrator receives tenant-scoped permissions only, never system permissions
-- and never the platform-level create/delete company privileges.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'COMPANY_ADMIN'
  AND p."isActive" = true AND p."module" <> 'system'
  AND NOT (p."module" = 'company' AND p."resource" = 'company' AND p."action" IN ('CREATE'::"PermissionAction", 'DELETE'::"PermissionAction"))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- HR administration covers HR operations, scheduling, holidays, reporting and the dashboard.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'HR_ADMIN'
  AND p."isActive" = true
  AND p."module" IN ('users','departments','designations','employees','attendance','leave','audit','dashboard','scheduling','schedules','shifts','holidays','reports')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Finance role gets finance operations plus dashboard/report/audit visibility.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'FINANCE_ADMIN'
  AND p."isActive" = true AND p."module" IN ('payroll','wallet','payments','dashboard','reports','audit')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Employee access is read-only except the inventory transaction confirmation permission
-- used by the employee-confirmation workflow.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'EMPLOYEE'
  AND p."isActive" = true
  AND ((p."action" = 'READ'::"PermissionAction" AND p."module" IN ('dashboard','employees','attendance','leave','payroll','wallet','inventory'))
    OR (p."module" = 'inventory' AND p."resource" = 'transactions' AND p."action" = 'APPROVE'::"PermissionAction"))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Store keepers manage inventory but only receive the read dashboard permission outside inventory.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."companyId" IS NULL AND r."isSystem" = true AND r."name" = 'STORE_KEEPER'
  AND p."isActive" = true
  AND (p."module" = 'inventory' OR (p."module" = 'dashboard' AND p."resource" = 'dashboard' AND p."action" = 'READ'::"PermissionAction))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
