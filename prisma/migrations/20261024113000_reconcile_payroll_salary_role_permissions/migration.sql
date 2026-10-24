-- Reconcile the effective tenant-role permissions used by requirePermission.
-- This does not bypass RBAC and never grants salary access to shared/global roles.

INSERT INTO "permissions" ("id", "module", "resource", "action", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'payroll', 'salaries', 'READ'::"PermissionAction", 'View employee salary assignments', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'payroll', 'salaries', 'UPDATE'::"PermissionAction", 'Update employee salary assignments', true, NOW(), NOW())
ON CONFLICT ("module", "resource", "action") DO UPDATE SET
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = NOW();

-- Some existing tenant roles are immutable snapshots of an older published
-- payroll template. Publish a new template version with READ + UPDATE if that
-- template already allowed salary creation. Old published versions stay intact.
CREATE TEMP TABLE "_salary_permissions_template_backfill" AS
SELECT
  t."id" AS "templateId",
  v."id" AS "oldVersionId",
  gen_random_uuid()::text AS "newVersionId",
  (SELECT COALESCE(MAX(v2."version"), 0) + 1 FROM "role_template_versions" v2 WHERE v2."templateId" = t."id") AS "newVersion",
  v."description" AS "description",
  v."createdById" AS "createdById"
FROM "role_templates" t
JOIN LATERAL (
  SELECT candidate.*
  FROM "role_template_versions" candidate
  WHERE candidate."templateId" = t."id" AND candidate."status" = 'PUBLISHED'
  ORDER BY candidate."version" DESC
  LIMIT 1
) v ON true
WHERE EXISTS (
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

UPDATE "role_template_versions" old_version
SET "status" = 'SUPERSEDED'
FROM "_salary_permissions_template_backfill" backfill
WHERE old_version."id" = backfill."oldVersionId";

INSERT INTO "role_template_versions" ("id", "templateId", "version", "description", "status", "createdById", "publishedAt", "createdAt")
SELECT "newVersionId", "templateId", "newVersion", "description", 'PUBLISHED', "createdById", NOW(), NOW()
FROM "_salary_permissions_template_backfill";

INSERT INTO "role_template_version_permissions" ("versionId", "permissionId")
SELECT backfill."newVersionId", old_permission."permissionId"
FROM "_salary_permissions_template_backfill" backfill
JOIN "role_template_version_permissions" old_permission ON old_permission."versionId" = backfill."oldVersionId"
ON CONFLICT ("versionId", "permissionId") DO NOTHING;

INSERT INTO "role_template_version_permissions" ("versionId", "permissionId")
SELECT backfill."newVersionId", permission."id"
FROM "_salary_permissions_template_backfill" backfill
JOIN "permissions" permission ON permission."module" = 'payroll'
  AND permission."resource" = 'salaries'
  AND permission."action" IN ('READ'::"PermissionAction", 'UPDATE'::"PermissionAction")
  AND permission."isActive" = true
ON CONFLICT ("versionId", "permissionId") DO NOTHING;

-- Grant READ to active company-owned roles that are already authorised to
-- create salary records, are core company/finance admins, or derive from a
-- published template explicitly granting salary access. This reconciles older
-- role snapshots without widening access to unrelated employee roles.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT role."id", salary_read."id"
FROM "roles" role
JOIN "permissions" salary_read ON salary_read."module" = 'payroll'
  AND salary_read."resource" = 'salaries'
  AND salary_read."action" = 'READ'::"PermissionAction"
  AND salary_read."isActive" = true
WHERE role."companyId" IS NOT NULL
  AND role."scope" = 'COMPANY'::"RoleScope"
  AND role."isActive" = true
  AND (
    UPPER(role."name") IN ('COMPANY_ADMIN', 'FINANCE_ADMIN')
    OR EXISTS (
      SELECT 1
      FROM "role_permissions" grant_row
      JOIN "permissions" existing_permission ON existing_permission."id" = grant_row."permissionId"
      WHERE grant_row."roleId" = role."id"
        AND existing_permission."module" = 'payroll'
        AND existing_permission."resource" = 'salaries'
        AND existing_permission."action" = 'CREATE'::"PermissionAction"
        AND existing_permission."isActive" = true
    )
    OR EXISTS (
      SELECT 1
      FROM "role_template_versions" latest_version
      JOIN "role_template_version_permissions" template_grant ON template_grant."versionId" = latest_version."id"
      JOIN "permissions" template_permission ON template_permission."id" = template_grant."permissionId"
      WHERE latest_version."templateId" = role."sourceTemplateId"
        AND latest_version."status" = 'PUBLISHED'
        AND latest_version."version" = (
          SELECT MAX(latest."version") FROM "role_template_versions" latest
          WHERE latest."templateId" = role."sourceTemplateId" AND latest."status" = 'PUBLISHED'
        )
        AND template_permission."module" = 'payroll'
        AND template_permission."resource" = 'salaries'
        AND template_permission."action" IN ('CREATE'::"PermissionAction", 'READ'::"PermissionAction")
        AND template_permission."isActive" = true
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Grant UPDATE only to roles already able to create salaries, the core
-- company/finance administrators, or roles whose latest published template
-- explicitly allows salary updates or creation.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT role."id", salary_update."id"
FROM "roles" role
JOIN "permissions" salary_update ON salary_update."module" = 'payroll'
  AND salary_update."resource" = 'salaries'
  AND salary_update."action" = 'UPDATE'::"PermissionAction"
  AND salary_update."isActive" = true
WHERE role."companyId" IS NOT NULL
  AND role."scope" = 'COMPANY'::"RoleScope"
  AND role."isActive" = true
  AND (
    UPPER(role."name") IN ('COMPANY_ADMIN', 'FINANCE_ADMIN')
    OR EXISTS (
      SELECT 1
      FROM "role_permissions" grant_row
      JOIN "permissions" existing_permission ON existing_permission."id" = grant_row."permissionId"
      WHERE grant_row."roleId" = role."id"
        AND existing_permission."module" = 'payroll'
        AND existing_permission."resource" = 'salaries'
        AND existing_permission."action" = 'CREATE'::"PermissionAction"
        AND existing_permission."isActive" = true
    )
    OR EXISTS (
      SELECT 1
      FROM "role_template_versions" latest_version
      JOIN "role_template_version_permissions" template_grant ON template_grant."versionId" = latest_version."id"
      JOIN "permissions" template_permission ON template_permission."id" = template_grant."permissionId"
      WHERE latest_version."templateId" = role."sourceTemplateId"
        AND latest_version."status" = 'PUBLISHED'
        AND latest_version."version" = (
          SELECT MAX(latest."version") FROM "role_template_versions" latest
          WHERE latest."templateId" = role."sourceTemplateId" AND latest."status" = 'PUBLISHED'
        )
        AND template_permission."module" = 'payroll'
        AND template_permission."resource" = 'salaries'
        AND template_permission."action" IN ('CREATE'::"PermissionAction", 'UPDATE'::"PermissionAction")
        AND template_permission."isActive" = true
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DROP TABLE "_salary_permissions_template_backfill";
