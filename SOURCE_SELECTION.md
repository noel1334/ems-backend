# Backend source selection

This package contains the canonical outer `ems-backend-main` project from the uploaded current backend archive. The older nested duplicate project and non-runtime backup artifacts were excluded. All active `prisma/migrations/*/migration.sql` directories, application source, tests, package files, and environment example files were retained. The omitted backup artifacts are preserved separately in `ems-project-clean-reference-backups.zip`.

Do not deploy until Prisma validation, migrations, tests, and environment review pass against the target database. This cleanup does not apply migrations or change application behaviour.
