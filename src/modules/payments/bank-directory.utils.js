const aliases = new Map([
  ["uba", "uba"],
  ["united bank for africa", "uba"],
  ["united bank africa", "uba"],
  ["united for africa", "uba"],
  ["first bank", "first bank"],
  ["first", "first bank"],
  ["first bank of nigeria", "first bank"],
  ["firstbank", "first bank"],
  ["gtbank", "gtbank"],
  ["guaranty trust", "gtbank"],
  ["guaranty trust bank", "gtbank"],
  ["access", "access bank"],
  ["access bank", "access bank"],
  ["zenith", "zenith bank"],
  ["zenith bank", "zenith bank"],
  ["stanbic ibtc", "stanbic ibtc"],
  ["stanbic ibtc bank", "stanbic ibtc"],
  ["fcmb", "fcmb"],
  ["first city monument", "fcmb"],
  ["first city monument bank", "fcmb"],
  ["union", "union bank"],
  ["union bank", "union bank"],
  ["union bank of nigeria", "union bank"],
  ["ecobank", "ecobank"],
  ["ecobank nigeria", "ecobank"],
  ["fidelity", "fidelity bank"],
  ["fidelity bank", "fidelity bank"],
  ["wema", "wema bank"],
  ["wema bank", "wema bank"],
  ["sterling", "sterling bank"],
  ["sterling bank", "sterling bank"],
  ["polaris", "polaris bank"],
  ["polaris bank", "polaris bank"],
  ["keystone", "keystone bank"],
  ["keystone bank", "keystone bank"],
  ["providus", "providus bank"],
  ["providus bank", "providus bank"],
  ["jaiz", "jaiz bank"],
  ["jaiz bank", "jaiz bank"],
  ["opay", "opay"],
  ["opay digital services", "opay"],
  ["moniepoint", "moniepoint"],
  ["moniepoint microfinance bank", "moniepoint"],
  ["kuda", "kuda"],
  ["kuda microfinance bank", "kuda"],
  ["palmpay", "palmpay"],
  ["palmpay limited", "palmpay"],
]);

export function normalizeBankName(value) {
  const raw = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (aliases.has(raw)) return aliases.get(raw);
  const normalized = raw
    .replace(/\b(the|plc|limited|ltd|nigeria|microfinance|mfb|bank)\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return aliases.get(normalized) ?? normalized;
}

export function mergeProviderBankLists(paystackBanks = [], flutterwaveBanks = []) {
  const merged = new Map();
  const add = (row, provider) => {
    const name = String(row?.name ?? row?.bankName ?? "").trim();
    const code = String(row?.code ?? "").trim();
    if (!name || !code) return;
    const key = normalizeBankName(name);
    if (!key) return;
    const existing = merged.get(key) ?? {
      key,
      name,
      paystackBankCode: null,
      flutterwaveBankCode: null,
      supportedBy: [],
    };
    // Prefer Paystack's display label if both providers supply the institution.
    if (provider === "PAYSTACK") {
      existing.name = name;
      existing.paystackBankCode = code;
    } else {
      existing.flutterwaveBankCode = code;
    }
    if (!existing.supportedBy.includes(provider)) existing.supportedBy.push(provider);
    merged.set(key, existing);
  };

  for (const row of paystackBanks) add(row, "PAYSTACK");
  for (const row of flutterwaveBanks) add(row, "FLUTTERWAVE");

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
