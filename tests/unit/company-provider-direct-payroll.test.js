import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

describe("company-direct provider payroll funding", () => {
  it("does not require or debit the internal EMS Monnify salary wallet for new batches", () => {
    const source = read("src/modules/payments/monnify/monnify.service.js");
    expect(source).not.toMatch(/getWallet\s*\(/);
    expect(source).not.toMatch(/debitWalletInTransaction\s*\(/);
    expect(source).not.toMatch(/EMS_MONNIFY_SALARY_BALANCE_INSUFFICIENT/);
    expect(source).toMatch(/monnifyEndpoints\.balance\(connection, connection\.sourceAccountNumber\)/);
  });

  it("only releases a historical Monnify reservation when the original ledger debit exists", () => {
    const source = read("src/modules/payments/monnify/monnify.service.js");
    expect(source).toMatch(/MONNIFY-PAYROLL-RESERVE-\$\{batch\.batchReference\}/);
    expect(source).toMatch(/if \(legacyReservation && payout && update\.data\.status === "FAILED"\)/);
    expect(source).toMatch(/MONNIFY-SINGLE-RETRY-RESERVE-/);
  });

  it("prevents a payroll period from being paid through multiple provider routes", () => {
    const paystack = read("src/modules/payments/company-paystack/company-paystack.service.js");
    const monnify = read("src/modules/payments/monnify/monnify.service.js");
    const legacy = read("src/modules/payroll/payroll.payout.service.js");
    expect(paystack).toMatch(/tx\.companyMonnifyBatch\.findFirst/);
    expect(monnify).toMatch(/tx\.companyPaystackBatch\.findFirst/);
    expect(legacy).toMatch(/tx\.companyPaystackBatch\.findFirst/);
    expect(legacy).toMatch(/tx\.companyMonnifyBatch\.findFirst/);
    expect(legacy).toMatch(/PAYROLL_PROVIDER_ROUTE_CONFLICT/);
  });
});
