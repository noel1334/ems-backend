export const canonicalMonnifyBankName = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\b(limited|ltd|plc|bank|of nigeria|nigeria)\b/g, " ")
  .replace(/[^a-z0-9]/g, "")
  .trim();

export const normalizeMonnifyBanks = (payload) => {
  // The standard Monnify envelope is unwrapped by monnifyRequest(), but accept
  // documented/raw envelopes as well so harmless response-shape changes do not
  // silently empty the bank selector.
  const candidates = [
    payload,
    payload?.responseBody,
    payload?.banks,
    payload?.data,
    payload?.data?.banks,
    payload?.responseBody?.banks,
    payload?.content,
    payload?.data?.content,
  ];
  const rows = candidates.find(Array.isArray) || [];
  const byCode = new Map();
  for (const row of rows) {
    const name = String(row?.name ?? row?.bankName ?? row?.bank_name ?? "").trim();
    // Keep the code exactly as Monnify supplied it. In particular, do not
    // coerce numeric-looking strings through Number() and lose leading zeroes.
    const rawCode = row?.code ?? row?.bankCode ?? row?.bank_code;
    // Monnify returns bank codes as strings (for example "058"). If a future
    // response changes this to a number, reject it rather than inventing a
    // leading zero and potentially routing a payment to the wrong bank.
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    if (!name || !/^\d{2,10}$/.test(code)) continue;
    if (!byCode.has(code)) byCode.set(code, { name, code });
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const monnifyFailureMessage = (responseCode, responseMessage) => {
  const code = String(responseCode || "").trim().toUpperCase();
  const providerMessage = String(responseMessage || "").trim();
  if (code === "99") {
    return `Monnify returned code 99 (unexpected processing error)${providerMessage ? `: ${providerMessage}` : "."} Code 99 alone does not confirm that the bank account is invalid. Retry the enquiry once; if it persists, contact Monnify support before changing the employee's details.`;
  }
  if (code === "D03") {
    return `Monnify returned D03 (invalid account details)${providerMessage ? `: ${providerMessage}` : "."} Confirm the account number and the bank selected from Monnify's bank directory.`;
  }
  return providerMessage || `Monnify rejected the request${code ? ` (${code})` : ""}.`;
};
