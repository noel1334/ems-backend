-- SaaS role-template separation: global templates are versioned defaults; each tenant receives its own role snapshots.
-- DDL is idempotent because an earlier preview ZIP may already have created the template tables.
CREATE TABLE IF NOT EXISTS "role_templates" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "industry" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_templates_key_key" ON "role_templates"("key");
CREATE INDEX IF NOT EXISTS "role_templates_industry_isActive_idx" ON "role_templates"("industry", "isActive");

CREATE TABLE IF NOT EXISTS "role_template_versions" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_template_versions_templateId_version_key" ON "role_template_versions"("templateId", "version");
CREATE INDEX IF NOT EXISTS "role_template_versions_templateId_status_idx" ON "role_template_versions"("templateId", "status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_template_versions_templateId_fkey') THEN
    ALTER TABLE "role_template_versions" ADD CONSTRAINT "role_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "role_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "role_template_version_permissions" (
  "versionId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "role_template_version_permissions_pkey" PRIMARY KEY ("versionId", "permissionId")
);
CREATE INDEX IF NOT EXISTS "role_template_version_permissions_permissionId_idx" ON "role_template_version_permissions"("permissionId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_template_version_permissions_versionId_fkey') THEN
    ALTER TABLE "role_template_version_permissions" ADD CONSTRAINT "role_template_version_permissions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "role_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_template_version_permissions_permissionId_fkey') THEN
    ALTER TABLE "role_template_version_permissions" ADD CONSTRAINT "role_template_version_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "sourceTemplateId" TEXT;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "sourceTemplateVersion" INTEGER;
CREATE INDEX IF NOT EXISTS "roles_sourceTemplateId_idx" ON "roles"("sourceTemplateId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_sourceTemplateId_fkey') THEN
    ALTER TABLE "roles" ADD CONSTRAINT "roles_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "role_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Bootstrap version 1 of each built-in company role from the currently-seeded role permissions.
INSERT INTO "role_templates" ("id", "key", "name", "description", "industry", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."name", r."name", r."description", NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."companyId" IS NULL AND r."scope" = 'COMPANY'::"RoleScope" AND r."isSystem" = true AND r."name" <> 'SUPER_ADMIN'
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_template_versions" ("id", "templateId", "version", "description", "status", "createdById", "publishedAt", "createdAt")
SELECT gen_random_uuid()::text, t."id", 1, t."description", 'PUBLISHED', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "role_templates" t
WHERE t."key" IN ('COMPANY_ADMIN', 'HR_ADMIN', 'FINANCE_ADMIN', 'EMPLOYEE', 'STORE_KEEPER')
ON CONFLICT ("templateId", "version") DO NOTHING;

INSERT INTO "role_template_version_permissions" ("versionId", "permissionId")
SELECT v."id", rp."permissionId"
FROM "role_template_versions" v
JOIN "role_templates" t ON t."id" = v."templateId"
JOIN "roles" gr ON gr."name" = t."key" AND gr."companyId" IS NULL AND gr."scope" = 'COMPANY'::"RoleScope" AND gr."isSystem" = true
JOIN "role_permissions" rp ON rp."roleId" = gr."id"
JOIN "permissions" p ON p."id" = rp."permissionId"
WHERE v."version" = 1
  AND lower(p."module") NOT IN ('system', 'platform')
  AND NOT (lower(p."module") = 'company' AND lower(p."resource") = 'company' AND upper(p."action"::text) IN ('CREATE', 'DELETE'))
ON CONFLICT DO NOTHING;

-- Clean any non-tenant-assignable grants from templates created by an earlier preview build.
DELETE FROM "role_template_version_permissions" rvp
USING "permissions" p
WHERE p."id" = rvp."permissionId"
  AND (
    lower(p."module") IN ('system', 'platform')
    OR (lower(p."module") = 'company' AND lower(p."resource") = 'company' AND upper(p."action"::text) IN ('CREATE', 'DELETE'))
  );

-- Snapshot core system roles per tenant so one tenant never edits another tenant's permissions.
INSERT INTO "roles" ("id", "companyId", "name", "description", "scope", "isSystem", "isActive", "sourceTemplateId", "sourceTemplateVersion", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", gr."name", COALESCE(latest."description", t."description", gr."description"), 'COMPANY'::"RoleScope", false, gr."isActive", t."id", latest."version", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" c
CROSS JOIN "roles" gr
JOIN "role_templates" t ON t."key" = gr."name"
JOIN LATERAL (
  SELECT v."id", v."version", v."description"
  FROM "role_template_versions" v
  WHERE v."templateId" = t."id" AND v."status" = 'PUBLISHED'
  ORDER BY v."version" DESC LIMIT 1
) latest ON true
WHERE gr."companyId" IS NULL AND gr."scope" = 'COMPANY'::"RoleScope" AND gr."isSystem" = true AND gr."name" IN ('COMPANY_ADMIN', 'HR_ADMIN', 'FINANCE_ADMIN', 'EMPLOYEE', 'STORE_KEEPER')
ON CONFLICT ("companyId", "name") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "assignedAt")
SELECT tenantRole."id", templateGrant."permissionId", CURRENT_TIMESTAMP
FROM "roles" tenantRole
JOIN "role_template_versions" latest ON latest."templateId" = tenantRole."sourceTemplateId" AND latest."version" = tenantRole."sourceTemplateVersion" AND latest."status" = 'PUBLISHED'
JOIN "role_template_version_permissions" templateGrant ON templateGrant."versionId" = latest."id"
WHERE tenantRole."companyId" IS NOT NULL AND tenantRole."sourceTemplateId" IS NOT NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Move existing user role assignments from shared global company roles to tenant snapshots.
INSERT INTO "user_roles" ("userId", "roleId", "assignedAt")
SELECT ur."userId", tenantRole."id", ur."assignedAt"
FROM "user_roles" ur
JOIN "roles" globalRole ON globalRole."id" = ur."roleId" AND globalRole."companyId" IS NULL AND globalRole."scope" = 'COMPANY'::"RoleScope" AND globalRole."isSystem" = true
JOIN "users" u ON u."id" = ur."userId" AND u."companyId" IS NOT NULL
JOIN "roles" tenantRole ON tenantRole."companyId" = u."companyId" AND tenantRole."name" = globalRole."name"
ON CONFLICT ("userId", "roleId") DO NOTHING;

DELETE FROM "user_roles" ur
USING "roles" globalRole, "users" u
WHERE ur."roleId" = globalRole."id"
  AND globalRole."companyId" IS NULL
  AND globalRole."scope" = 'COMPANY'::"RoleScope"
  AND globalRole."isSystem" = true
  AND u."id" = ur."userId"
  AND u."companyId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "roles" tenantRole
    WHERE tenantRole."companyId" = u."companyId" AND tenantRole."name" = globalRole."name"
  );
