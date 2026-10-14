# Company Structure Templates — Backend Compatibility

The company `industry` field is stored as a nullable string in Prisma. `src/modules/companies/company.validation.js` now accepts the full set of industry values used by the frontend company structure and role-template selectors: healthcare, manufacturing, education, construction, hospitality, retail, logistics, finance, agriculture, technology, energy, real estate, telecommunications, media, security, mining, utilities, government, NGO, professional services, corporate, and other.

This is a validation-only expansion; it does not alter database columns or require a Prisma migration. Department and designation creation continues through the existing tenant-scoped endpoints and their `departments:CREATE` / `designations:CREATE` permissions. The backend remains authoritative for company scoping and permission checks. Structure templates do not create RBAC roles or permissions.

Validate with `node --check src/modules/companies/company.validation.js` and deploy the backend with the normal Render process.
