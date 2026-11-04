const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Resolve every Nigerian bank account before a transfer recipient is created.
 * Live mode always requires provider validation. In test mode it is enabled by
 * default; an explicit false setting is retained as a diagnostic-only escape
 * hatch for providers that temporarily make the resolver unavailable.
 */
export function shouldResolvePaystackAccounts(environment, env = process.env) {
  if (String(environment).toLowerCase() === "live") return true;
  const configured = String(env.PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX ?? "true").trim().toLowerCase();
  return !FALSE_VALUES.has(configured);
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
