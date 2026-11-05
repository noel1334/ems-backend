const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);

const ACCOUNT_VALIDATION_ERROR = /cannot resolve account|invalid account(?: number)?|account number.{0,50}(?:invalid|does not match|mismatch|not found)|(?:bank|recipient|beneficiar).{0,50}(?:invalid|unsupported|does not match|mismatch|not found)|(?:invalid|unsupported).{0,50}(?:bank code|recipient|beneficiar)|fraud watchlist/i;

/** Only account/beneficiary-specific 4xx responses are safe to skip per employee.
 * Authentication, throttling, network and provider failures must abort the whole
 * preparation phase before any transfer is initiated.
 */
export function isSkippablePaystackAccountError(error) {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  const message = String(error?.message || error?.details?.providerMessage || error?.details?.message || "");
  return (status === 400 || status === 422) && ACCOUNT_VALIDATION_ERROR.test(message);
}

export function isSkippablePaystackRecipientError(error) {
  return isSkippablePaystackAccountError(error);
}

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

/** Partition only rows that passed the preview's actual checks. In TEST mode this is
 * intentionally a local/simulation eligibility check, not a claim of live bank verification. */
export function partitionPaystackEmployees(employees = []) {
  const rows = Array.isArray(employees) ? employees : [];
  return {
    eligible: rows.filter((employee) => employee?.valid === true),
    skipped: rows.filter((employee) => employee?.valid !== true),
  };
}

/** A preview can proceed with partial eligibility, but never with zero eligible employees. */
export function canSubmitPaystackPreview({ environment, validCount, insufficientBalance, providerValidationComplete }) {
  if (Number(validCount || 0) < 1 || Boolean(insufficientBalance)) return false;
  if (String(environment).toLowerCase() === "test") return true;
  return Boolean(providerValidationComplete);
}


/** Prepare recipients independently so one bad beneficiary does not block valid colleagues. */
export async function preparePaystackRecipients(employees, createRecipient, summarizeFailure, concurrency = 4) {
  const rows = Array.isArray(employees) ? employees : [];
  const results = new Array(rows.length);
  let nextIndex = 0;
  let hasFatalFailure = false;
  const runnerCount = Math.min(Math.max(1, Number(concurrency) || 1), rows.length);
  await Promise.all(Array.from({ length: runnerCount }, async () => {
    while (true) {
      if (hasFatalFailure) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= rows.length) return;
      const row = rows[index];
      try {
        results[index] = { ok: true, item: await createRecipient(row) };
      } catch (error) {
        const failure = summarizeFailure(row, error);
        const skippable = isSkippablePaystackRecipientError(error);
        if (!skippable) hasFatalFailure = true;
        results[index] = { ok: false, skippable, row, failure, error };
      }
    }
  }));
  return {
    prepared: results.filter((result) => result?.ok).map((result) => result.item),
    failed: results.filter((result) => result && !result.ok && result.skippable).map(({ row, failure }) => ({ row, failure })),
    fatal: results.filter((result) => result && !result.ok && !result.skippable).map(({ row, failure, error }) => ({ row, failure, error })),
  };
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
