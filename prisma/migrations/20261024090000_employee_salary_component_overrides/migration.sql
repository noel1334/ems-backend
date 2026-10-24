-- Employee-specific fixed amount / percentage / active status overrides.
ALTER TABLE "employee_salaries"
ADD COLUMN "componentOverrides" JSONB;
