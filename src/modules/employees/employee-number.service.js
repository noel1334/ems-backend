import crypto from "node:crypto";
import { generateNumber } from "../../common/utils/generateNumber.js";

const SEQUENCE_KEY = "employee.number.sequence";

export async function nextEmployeeNumber(companyId, tx) {
  if (!companyId || !tx?.$queryRaw) throw new Error("companyId and transaction client are required");
  const id = crypto.randomUUID();
  const rows = await tx.$queryRaw`
    INSERT INTO system_settings (id, "companyId", key, value, "createdAt", "updatedAt")
    VALUES (${id}::uuid, ${companyId}::uuid, ${SEQUENCE_KEY},
      (SELECT COALESCE(MAX(CASE WHEN "employeeNumber" ~ '^EMP-[0-9]+$' THEN SUBSTRING("employeeNumber" FROM 5)::bigint ELSE 0 END), 0) + 1)::text,
      NOW(), NOW())
    ON CONFLICT ("companyId", key)
    DO UPDATE SET value = (COALESCE(system_settings.value, '0')::bigint + 1)::text, "updatedAt" = NOW()
    RETURNING value
  `;
  const sequence = Number(rows?.[0]?.value);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid employee number sequence");
  return generateNumber("EMP", sequence, 6);
}
