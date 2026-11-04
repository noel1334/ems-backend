const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);

/**
 * Live payroll must always resolve beneficiaries before submission. Paystack's
 * TEST environment has a small daily allowance for resolving real bank
 * accounts, so sandbox previews skip /bank/resolve by default and rely on
 * recipient creation as the provider-side preflight before any test transfer.
 * Operators may opt in to consume a sandbox lookup with the env flag.
 */
export function shouldResolvePaystackAccounts(environment, env = process.env) {
  if (String(environment).toLowerCase() === "live") return true;
  const configured = String(env.PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX ?? "false").trim().toLowerCase();
  return TRUE_VALUES.has(configured);
}

/** Detect Paystack's observed TEST-mode daily cap for real bank lookups. */
export function isPaystackSandboxResolveLimitError(message) {
  const raw = String(message || "");
  return /test\s+mode.*daily\s+limit.*(?:\d+|three).*live\s+bank\s+resolves?\s+exceeded/i.test(raw)
    || /daily\s+limit.*live\s+bank\s+resolves?\s+exceeded/i.test(raw);
}

/** Sandbox can proceed after local checks; recipient creation is preflighted before transfers. */
export function canSubmitPaystackPreview({ environment, invalidCount, insufficientBalance, providerValidationComplete }) {
  if (Number(invalidCount || 0) > 0 || Boolean(insufficientBalance)) return false;
  if (String(environment).toLowerCase() === "test") return true;
  return Boolean(providerValidationComplete);
}

/** Translate Paystack's common account-resolution failure into a safe action. */
export function explainPaystackAccountError(message, bankCode) {
  const raw = String(message || "Paystack could not validate this bank account.").trim();
  if (/cannot resolve account|bank code.{0,40}account number.{0,40}match/i.test(raw)) {
    const code = String(bankCode || "").trim();
    return `Paystack could not match this account number to the selected Paystack bank${code ? ` (code ${code})` : ""}. Confirm the 10-digit account number and re-select the correct Paystack bank. This does not change the employee's Flutterwave or Monnify bank details.`;
  }
  if (/account number is invalid|invalid account number/i.test(raw)) {
    return `Paystack rejected this account number. Confirm the employee's 10-digit account number and selected Paystack bank. This does not change the employee's Flutterwave or Monnify bank details.`;
  }
  return raw.slice(0, 500);
}

/** Safe, employee-specific diagnostics. Never include the full account number. */
export function recipientFailureSummary(row, error) {
  const rawMessage = error?.message || "Paystack could not create this transfer recipient.";
  const message = explainPaystackAccountError(rawMessage, row?._bankCode);
  return {
    employee: String(row?.employee || "Employee").slice(0, 120),
    bankName: String(row?.bankName || "Unknown bank").slice(0, 120),
    bankCode: String(row?._bankCode || "").slice(0, 20),
    accountNumberLast4: String(row?.accountNumberLast4 || "").slice(-4),
    code: String(error?.code || error?.details?.code || "PAYSTACK_RECIPIENT_FAILED").slice(0, 80),
    message,
  };
}
