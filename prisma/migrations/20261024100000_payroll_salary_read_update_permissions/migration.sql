-- Repair Employee Salaries access for company roles that can already create salary records.
-- Published role-template versions are immutable; create a new published version instead of rewriting old history.

INSERT INTO "permissions" ("id", "module", "resource", "action", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'payroll', 'salaries', 'READ'::"PermissionAction", 'View employee salary assignments', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'salaries', 'UPDATE'::"PermissionAction", 'Update employee salary assignment status', true, NOW(), NOW())
ON CONFLICT ("module", "resource", "action") DO UPDATE SET
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = NOW();

-- Existing tenant role snapshots are independent of platform templates. Give READ/UPDATE
-- to company/finance administrators, and to any role that already had salary CREATE.
-- This completes the intended salary-management workflow without granting salary access
-- to unrelated employee roles.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT r."id", access_permission."id"
FROM "roles" r
JOIN "permissions" access_permission
  ON access_permission."module" = 'payroll'
 AND access_permission."resource" = 'salaries'
 AND access_permission."action" IN ('READ'::"PermissionAction", 'UPDATE'::"PermissionAction")
WHERE r."companyId" IS NOT NULL
  AND r."scope" = 'COMPANY'::"RoleScope"
  AND r."isActive" = true
  AND (
    UPPER(r."name") IN ('COMPANY_ADMIN', 'FINANCE_ADMIN')
    OR EXISTS (
      SELECT 1
      FROM "role_permissions" existing_grant
      JOIN "permissions" create_permission ON create_permission."id" = existing_grant."permissionId"
      WHERE existing_grant."roleId" = r."id"
        AND create_permission."module" = 'payroll'
        AND create_permission."resource" = 'salaries'
        AND create_permission."action" = 'CREATE'::"PermissionAction"
        AND create_permission."isActive" = true
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Update existing published templates by publishing a new version that preserves all old
-- permissions and adds salary READ/UPDATE. Previously published versions remain immutable.
CREATE TEMP TABLE "_payroll_salary_template_backfill" AS
SELECT
  t."id" AS "templateId",
  v."id" AS "oldVersionId",
  gen_random_uuid()::text AS "newVersionId",
  (SELECT COALESCE(MAX(v2."version"), 0) + 1 FROM "role_template_versions" v2 WHERE v2."templateId" = t."id") AS "newVersion",
  v."description" AS "versionDescription",
  v."createdById" AS "createdById"
FROM "role_templates" t
JOIN "role_template_versions" v
  ON v."templateId" = t."id"
 AND v."status" = 'PUBLISHED'
WHERE v."id" = (
  SELECT latest."id"
  FROM "role_template_versions" latest
  WHERE latest."templateId" = t."id" AND latest."status" = 'PUBLISHED'
  ORDER BY latest."version" DESC
  LIMIT 1
)
AND EXISTS (
  SELECT 1
  FROM "role_template_version_permissions" vp
  JOIN "permissions" p ON p."id" = vp."permissionId"
  WHERE vp."versionId" = v."id"
    AND p."module" = 'payroll' AND p."resource" = 'salaries'
    AND p."action" = 'CREATE'::"PermissionAction"
)
AND (
  NOT EXISTS (
    SELECT 1 FROM "role_template_version_permissions" vp
    JOIN "permissions" p ON p."id" = vp."permissionId"
    WHERE vp."versionId" = v."id" AND p."module" = 'payroll'
      AND p."resource" = 'salaries' AND p."action" = 'READ'::"PermissionAction"
      AND p."isActive" = true
  )
  OR NOT EXISTS (
    SELECT 1 FROM "role_template_version_permissions" vp
    JOIN "permissions" p ON p."id" = vp."permissionId"
    WHERE vp."versionId" = v."id" AND p."module" = 'payroll'
      AND p."resource" = 'salaries' AND p."action" = 'UPDATE'::"PermissionAction"
      AND p."isActive" = true
  )
);

UPDATE "role_template_versions" v
SET "status" = 'SUPERSEDED'
FROM "_payroll_salary_template_backfill" backfill
WHERE v."id" = backfill."oldVersionId";

INSERT INTO "role_template_versions" ("id", "templateId", "version", "description", "status", "createdById", "publishedAt", "createdAt")
SELECT "newVersionId", "templateId", "newVersion", "versionDescription", 'PUBLISHED', "createdById", NOW(), NOW()
FROM "_payroll_salary_template_backfill";

-- Copy every permission from the old version into the new version.
INSERT INTO "role_template_version_permissions" ("versionId", "permissionId")
SELECT backfill."newVersionId", old_permission."permissionId"
FROM "_payroll_salary_template_backfill" backfill
JOIN "role_template_version_permissions" old_permission
  ON old_permission."versionId" = backfill."oldVersionId"
ON CONFLICT ("versionId", "permissionId") DO NOTHING;

-- Add READ and UPDATE to each new version.
INSERT INTO "role_template_version_permissions" ("versionId", "permissionId")
SELECT backfill."newVersionId", p."id"
FROM "_payroll_salary_template_backfill" backfill
JOIN "permissions" p
  ON p."module" = 'payroll'
 AND p."resource" = 'salaries'
 AND p."action" IN ('READ'::"PermissionAction", 'UPDATE'::"PermissionAction")
 AND p."isActive" = true
ON CONFLICT ("versionId", "permissionId") DO NOTHING;

DROP TABLE "_payroll_salary_template_backfill";
