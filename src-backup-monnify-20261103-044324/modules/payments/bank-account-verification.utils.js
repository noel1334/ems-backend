export const normalizeResolvedBankAccount = (provider, response, requestedAccountNumber) => {
  const data = response?.data;
  const accepted = provider === "PAYSTACK"
    ? response?.status === true
    : provider === "FLUTTERWAVE" && response?.status === "success";

  if (!accepted || !data || typeof data !== "object") {
    const message = response?.message || "The provider could not verify this bank account.";
    throw new Error(message);
  }

  const resolvedNumber = String(data.account_number ?? requestedAccountNumber ?? "").replace(/\s/g, "");
  const accountName = String(data.account_name ?? data.accountName ?? data.full_name ?? data.fullname ?? "").trim();
  if (resolvedNumber !== String(requestedAccountNumber)) {
    throw new Error("The provider returned an account number that does not match the requested account.");
  }
  if (accountName.length < 2) {
    throw new Error("The provider resolved the account number but did not return a usable account name.");
  }

  return { provider, accountNumber: resolvedNumber, accountName };
};

export const normalizeProviderBalanceNgn = (provider, response) => {
  if (provider === "PAYSTACK") {
    if (response?.status !== true || !Array.isArray(response?.data)) {
      throw new Error(response?.message || "Paystack did not return an available balance.");
    }
    const account = response.data.find((entry) => String(entry?.currency || "").toUpperCase() === "NGN");
    if (!account || !Number.isFinite(Number(account.balance)) || Number(account.balance) < 0) {
      throw new Error("Paystack did not return a valid NGN balance.");
    }
    // Paystack reports NGN balances in kobo.
    return (Number(account.balance) / 100).toFixed(2);
  }

  if (provider === "FLUTTERWAVE") {
    if (response?.status !== "success" || !Array.isArray(response?.data)) {
      throw new Error(response?.message || "Flutterwave did not return wallet balances.");
    }
    const account = response.data.find((entry) => String(entry?.currency || "").toUpperCase() === "NGN");
    const available = account?.available_balance;
    if (available === undefined || !Number.isFinite(Number(available)) || Number(available) < 0) {
      throw new Error("Flutterwave did not return a valid available NGN balance.");
    }
    return Number(available).toFixed(2);
  }

  throw new Error(`Unsupported payout provider: ${provider}`);
};
