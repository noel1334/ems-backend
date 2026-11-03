import AppError from "../../../common/errors/AppError.js";

/**
 * Normalize Monnify's GET /api/v1/banks response without coercing bank codes
 * to numbers (leading zeroes are significant, e.g. 044 and 058).
 */
export function normalizeMonnifyBankDirectory(payload) {
  const body = payload?.responseBody ?? payload;
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.banks)
      ? body.banks
      : Array.isArray(body?.content)
        ? body.content
        : Array.isArray(body?.data)
          ? body.data
          : [];

  const byCode = new Map();
  for (const row of rows) {
    const bankName = String(row?.name ?? row?.bankName ?? row?.bank_name ?? "").trim();
    const bankCode = String(row?.code ?? row?.bankCode ?? row?.bank_code ?? "").trim();
    if (!bankName || !/^\d{2,10}$/.test(bankCode)) continue;
    if (!byCode.has(bankCode)) byCode.set(bankCode, { bankName, bankCode, code: bankCode });
  }

  if (!byCode.size) {
    throw new AppError("Monnify returned an empty or invalid bank directory. Confirm that the connected account can access GET /api/v1/banks.", 502, {
      code: "MONNIFY_BANK_DIRECTORY_INVALID",
      details: { provider: "MONNIFY", endpoint: "GET /api/v1/banks" },
    });
  }

  return [...byCode.values()].sort((a, b) => a.bankName.localeCompare(b.bankName));
}

export function findMonnifyBankByCode(banks, bankCode) {
  const code = String(bankCode ?? "").trim();
  return (Array.isArray(banks) ? banks : []).find((bank) => bank.bankCode === code) ?? null;
}

export function canonicalMonnifyBankName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(microfinance|digital|services|service|limited|ltd|plc|bank|of nigeria|nigeria)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}
