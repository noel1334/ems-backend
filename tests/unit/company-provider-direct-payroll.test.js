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
  it("claims the shared period lock for company Paystack and Monnify, without internal wallet debits", () => {
    const paystack = read("src/modules/payments/company-paystack/company-paystack.service.js");
    const monnify = read("src/modules/payments/monnify/monnify.service.js");
    expect(paystack).toMatch(/claimPayrollFundingRoute\(tx, \{ companyId, periodId, fundingRoute: "DIRECT_PROVIDER", provider: "PAYSTACK" \}\)/);
    expect(monnify).toMatch(/claimPayrollFundingRoute\(tx, \{ companyId, periodId: payrollPeriodId, fundingRoute: "DIRECT_PROVIDER", provider: "MONNIFY" \}\)/);
    expect(paystack).toMatch(/fundingRoute: "DIRECT_PROVIDER"/);
    expect(monnify).toMatch(/fundingRoute: "DIRECT_PROVIDER"/);
    expect(paystack).not.toMatch(/debitWalletInTransaction\s*\(/);
    expect(monnify).not.toMatch(/debitWalletInTransaction\s*\(/);
  });


  it("routes Flutterwave salary transfers through the company's PSA wallet without EMS wallet reservation", () => {
    const legacy = read("src/modules/payroll/payroll.payout.service.js");
    const client = read("src/modules/payments/flutterwave/flutterwave.transfer.client.js");
    expect(legacy).toMatch(/getFlutterwaveFundingRoute\(companyId\)/);
    expect(legacy).toMatch(/getFlutterwavePayoutSubaccountBalance\(debitSubaccount\)/);
    expect(legacy).toMatch(/reservationAmount = fundingRoute === "EMS_WALLET" \? evaluation\.requiredTotal : new Decimal\(0\)/);
    expect(legacy).toMatch(/if \(fundingRoute === "EMS_WALLET"\) \{\s*await debitWalletInTransaction/);
    expect(legacy).toMatch(/debitSubaccount: flutterwaveDebitSubaccount/);
    expect(client).toMatch(/debit_subaccount: String\(debitSubaccount\)/);
    expect(legacy).toMatch(/DIRECT_PROVIDER.*FLUTTERWAVE/s);
    expect(legacy).toMatch(/Flutterwave PSA payout subaccounts are a production\/live product/);
  });

  it("classifies legacy provider transfers by the evaluated funding route and preserves EMS-wallet accounting", () => {
    const legacy = read("src/modules/payroll/payroll.payout.service.js");
    // Flutterwave may use a company PSA payout wallet (DIRECT_PROVIDER); otherwise
    // the legacy Paystack/Flutterwave workflow remains EMS_WALLET. The route is
    // evaluated during preview and claimed unchanged during execution.
    expect(legacy).toMatch(/const fundingRoute = evaluation\.preview\.fundingRoute/);
    expect(legacy).toMatch(/claimPayrollFundingRoute\(tx, \{ companyId, periodId, fundingRoute, provider \}\)/);
    expect(legacy).toMatch(/String\(batch\.fundingRoute \|\| "EMS_WALLET"\)\.toUpperCase\(\) !== fundingRoute/);
    expect(legacy).toMatch(/fundingRoute: "EMS_WALLET"/);
    expect(legacy).toMatch(/walletAccountForPayoutProvider = \(provider\) => String\(provider \|\| ""\)\.toUpperCase\(\) === "PAYSTACK" \? "PAYSTACK" : "GENERAL"/);
    expect(legacy).toMatch(/walletBalanceFieldForPayoutProvider\(provider\)/);
  });

});
