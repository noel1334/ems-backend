import { describe, expect, it, vi } from "vitest";
import {
  PAYROLL_FUNDING_ROUTE,
  assertPayrollFundingRouteCompatible,
  claimPayrollFundingRoute,
} from "../../src/modules/payroll/payroll.funding-route.service.js";

const expectAppError = (callback, statusCode, code) => {
  try {
    callback();
    throw new Error("Expected callback to throw an AppError");
  } catch (error) {
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
  }
};

const makeTx = ({
  period = { id: "period-1", payoutFundingRoute: null, payoutProvider: null },
  walletBatch = null,
  paystackBatch = null,
  monnifyBatch = null,
  directDisbursement = null,
  walletDisbursement = null,
  claimCount = 1,
} = {}) => {
  const calls = { periodFind: [], periodUpdate: [], walletBatchFind: [], disbursementFind: [] };
  const tx = {
    payrollPeriod: {
      findFirst: vi.fn(async (args) => {
        calls.periodFind.push(args);
        return period;
      }),
      updateMany: vi.fn(async (args) => {
        calls.periodUpdate.push(args);
        return { count: claimCount };
      }),
    },
    payrollPayoutBatch: {
      findUnique: vi.fn(async (args) => {
        calls.walletBatchFind.push(args);
        return walletBatch;
      }),
    },
    companyPaystackBatch: { findFirst: vi.fn(async () => paystackBatch) },
    companyMonnifyBatch: { findFirst: vi.fn(async () => monnifyBatch) },
    payrollDisbursement: {
      findFirst: vi.fn(async (args) => {
        calls.disbursementFind.push(args);
        if (args.where.provider?.in?.includes("PAYSTACK_COMPANY")) return directDisbursement;
        return walletDisbursement;
      }),
    },
    walletLedgerEntry: { findUnique: vi.fn(async () => null) },
  };
  return { tx, calls };
};

describe("payroll funding route lock", () => {
  it("allows EMS Wallet Payroll only with the legacy Paystack or Flutterwave rail", () => {
    expect(assertPayrollFundingRouteCompatible({
      requestedRoute: PAYROLL_FUNDING_ROUTE.EMS_WALLET,
      requestedProvider: "PAYSTACK",
    })).toEqual({ fundingRoute: "EMS_WALLET", provider: "PAYSTACK" });
    expect(assertPayrollFundingRouteCompatible({
      requestedRoute: PAYROLL_FUNDING_ROUTE.EMS_WALLET,
      requestedProvider: "FLUTTERWAVE",
    }).provider).toBe("FLUTTERWAVE");
  });

  it("allows Direct Provider Payroll only with company Paystack or Monnify", () => {
    expect(assertPayrollFundingRouteCompatible({
      requestedRoute: PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER,
      requestedProvider: "PAYSTACK",
    }).fundingRoute).toBe("DIRECT_PROVIDER");
    expect(assertPayrollFundingRouteCompatible({
      requestedRoute: PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER,
      requestedProvider: "MONNIFY",
    }).provider).toBe("MONNIFY");
  });

  it("rejects unsupported route/provider combinations before database work", () => {
    expectAppError(() => assertPayrollFundingRouteCompatible({
      requestedRoute: "EMS_WALLET",
      requestedProvider: "MONNIFY",
    }), 400, "PAYROLL_FUNDING_PROVIDER_ROUTE_INVALID");
    expectAppError(() => assertPayrollFundingRouteCompatible({
      requestedRoute: "DIRECT_PROVIDER",
      requestedProvider: "FLUTTERWAVE",
    }), 400, "PAYROLL_FUNDING_PROVIDER_ROUTE_INVALID");
  });

  it("rejects changing either the funding route or the provider for a locked period", () => {
    expectAppError(() => assertPayrollFundingRouteCompatible({
      currentRoute: "EMS_WALLET",
      currentProvider: "PAYSTACK",
      requestedRoute: "DIRECT_PROVIDER",
      requestedProvider: "MONNIFY",
    }), 409, "PAYROLL_FUNDING_ROUTE_CONFLICT");
    expectAppError(() => assertPayrollFundingRouteCompatible({
      currentRoute: "DIRECT_PROVIDER",
      currentProvider: "PAYSTACK",
      requestedRoute: "DIRECT_PROVIDER",
      requestedProvider: "MONNIFY",
    }), 409, "PAYROLL_FUNDING_ROUTE_CONFLICT");
  });

  it("claims a period using both tenant and period identifiers", async () => {
    const { tx, calls } = makeTx();
    const result = await claimPayrollFundingRoute(tx, {
      companyId: "company-A",
      periodId: "period-1",
      fundingRoute: "DIRECT_PROVIDER",
      provider: "PAYSTACK",
    });
    expect(result).toMatchObject({ fundingRoute: "DIRECT_PROVIDER", provider: "PAYSTACK", alreadyLocked: false });
    expect(calls.periodFind[0].where).toEqual({ id: "period-1", companyId: "company-A", deletedAt: null });
    expect(calls.periodUpdate[0].where).toEqual({ id: "period-1", companyId: "company-A", deletedAt: null, payoutFundingRoute: null });
    expect(calls.periodUpdate[0].data).toMatchObject({ payoutFundingRoute: "DIRECT_PROVIDER", payoutProvider: "PAYSTACK" });
  });

  it("rejects a period ID belonging to a different company", async () => {
    const { tx } = makeTx({ period: null });
    await expect(claimPayrollFundingRoute(tx, {
      companyId: "company-B",
      periodId: "period-1",
      fundingRoute: "EMS_WALLET",
      provider: "PAYSTACK",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("detects an existing company Paystack batch before allowing a wallet route", async () => {
    const { tx } = makeTx({ paystackBatch: { batchReference: "company-paystack-1" } });
    await expect(claimPayrollFundingRoute(tx, {
      companyId: "company-A",
      periodId: "period-1",
      fundingRoute: "EMS_WALLET",
      provider: "PAYSTACK",
    })).rejects.toMatchObject({ statusCode: 409, code: "PAYROLL_FUNDING_ROUTE_CONFLICT" });
  });

  it("treats an existing prepared legacy EMS wallet batch as route evidence", async () => {
    const { tx } = makeTx({ walletBatch: {
      id: "wallet-batch-1",
      provider: "FLUTTERWAVE",
      fundingRoute: "EMS_WALLET",
      status: "PREPARED",
    } });
    await expect(claimPayrollFundingRoute(tx, {
      companyId: "company-A",
      periodId: "period-1",
      fundingRoute: "DIRECT_PROVIDER",
      provider: "MONNIFY",
    })).rejects.toMatchObject({ statusCode: 409, code: "PAYROLL_FUNDING_ROUTE_CONFLICT" });
  });

  it("rejects conflicting historical evidence instead of guessing which route paid", async () => {
    const { tx } = makeTx({
      walletBatch: { id: "wallet-batch-1", provider: "PAYSTACK", fundingRoute: "EMS_WALLET", status: "PROCESSING" },
      monnifyBatch: { batchReference: "monnify-batch-1" },
    });
    await expect(claimPayrollFundingRoute(tx, {
      companyId: "company-A",
      periodId: "period-1",
      fundingRoute: "EMS_WALLET",
      provider: "PAYSTACK",
    })).rejects.toMatchObject({ statusCode: 409, code: "PAYROLL_FUNDING_ROUTE_HISTORY_CONFLICT" });
  });
});
