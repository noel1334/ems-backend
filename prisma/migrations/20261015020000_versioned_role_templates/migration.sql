CREATE TABLE "role_templates" (
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
CREATE UNIQUE INDEX "role_templates_key_key" ON "role_templates"("key");
CREATE INDEX "role_templates_industry_isActive_idx" ON "role_templates"("industry", "isActive");
CREATE TABLE "role_template_versions" (
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
CREATE UNIQUE INDEX "role_template_versions_templateId_version_key" ON "role_template_versions"("templateId", "version");
CREATE INDEX "role_template_versions_templateId_status_idx" ON "role_template_versions"("templateId", "status");
ALTER TABLE "role_template_versions" ADD CONSTRAINT "role_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "role_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "role_template_version_permissions" (
  "versionId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "role_template_version_permissions_pkey" PRIMARY KEY ("versionId", "permissionId")
);
CREATE INDEX "role_template_version_permissions_permissionId_idx" ON "role_template_version_permissions"("permissionId");
ALTER TABLE "role_template_version_permissions" ADD CONSTRAINT "role_template_version_permissions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "role_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_template_version_permissions" ADD CONSTRAINT "role_template_version_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
