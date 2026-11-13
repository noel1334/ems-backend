import AppError from "../../common/errors/AppError.js";

export const PAYROLL_FUNDING_ROUTE = Object.freeze({
  EMS_WALLET: "EMS_WALLET",
  DIRECT_PROVIDER: "DIRECT_PROVIDER",
});

const normalizeRoute = (value) => String(value || "").trim().toUpperCase();
const normalizeProvider = (value) => String(value || "").trim().toUpperCase();

export const assertPayrollFundingRouteCompatible = ({
  currentRoute,
  currentProvider,
  requestedRoute,
  requestedProvider,
}) => {
  const route = normalizeRoute(requestedRoute);
  const provider = normalizeProvider(requestedProvider);
  if (![PAYROLL_FUNDING_ROUTE.EMS_WALLET, PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER].includes(route)) {
    throw new AppError("Choose EMS Wallet Payroll or Direct Provider Payroll.", 400, { code: "PAYROLL_FUNDING_ROUTE_INVALID" });
  }
  if (!provider) throw new AppError("A payout provider is required for this payroll route.", 400, { code: "PAYROLL_FUNDING_PROVIDER_REQUIRED" });
  const allowedProviders = route === PAYROLL_FUNDING_ROUTE.EMS_WALLET
    ? ["PAYSTACK", "FLUTTERWAVE"]
    : ["PAYSTACK", "MONNIFY"];
  if (!allowedProviders.includes(provider)) {
    throw new AppError(
      `${provider} is not available for ${route === PAYROLL_FUNDING_ROUTE.EMS_WALLET ? "EMS Wallet Payroll" : "Direct Provider Payroll"}.`,
      400,
      { code: "PAYROLL_FUNDING_PROVIDER_ROUTE_INVALID", details: { fundingRoute: route, provider, allowedProviders } },
    );
  }

  const storedRoute = normalizeRoute(currentRoute);
  const storedProvider = normalizeProvider(currentProvider);
  if (storedRoute && (storedRoute !== route || (storedProvider && storedProvider !== provider))) {
    throw new AppError(
      `This payroll period is already locked to ${storedRoute === PAYROLL_FUNDING_ROUTE.EMS_WALLET ? "EMS Wallet Payroll" : "Direct Provider Payroll"} via ${storedProvider || "its original provider"}. A payroll period cannot be paid through more than one funding route or provider. Reconcile the original batch before taking any further action.`,
      409,
      { code: "PAYROLL_FUNDING_ROUTE_CONFLICT", details: { existingRoute: storedRoute, existingProvider: storedProvider || null, requestedRoute: route, requestedProvider: provider } },
    );
  }
  return { fundingRoute: route, provider };
};

const inferExistingRoute = async (tx, companyId, periodId) => {
  const [walletBatch, paystackBatch, monnifyBatch, directDisbursement, walletDisbursement] = await Promise.all([
    tx.payrollPayoutBatch.findUnique({ where: { companyId_periodId: { companyId, periodId } }, select: { id: true, provider: true, fundingRoute: true, status: true } }),
    tx.companyPaystackBatch.findFirst({ where: { companyId, payrollPeriodId: periodId }, select: { batchReference: true } }),
    tx.companyMonnifyBatch.findFirst({ where: { companyId, payrollPeriodId: periodId }, select: { batchReference: true } }),
    tx.payrollDisbursement.findFirst({ where: { companyId, periodId, provider: { in: ["PAYSTACK_COMPANY", "MONNIFY"] }, status: { not: "PENDING" } }, select: { provider: true } }),
    tx.payrollDisbursement.findFirst({ where: { companyId, periodId, provider: { in: ["PAYSTACK", "FLUTTERWAVE"] }, status: { not: "PENDING" } }, select: { provider: true } }),
  ]);

  const evidence = [];
  if (paystackBatch) evidence.push({ fundingRoute: PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER, provider: "PAYSTACK", source: "company_paystack_batch" });
  if (monnifyBatch) evidence.push({ fundingRoute: PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER, provider: "MONNIFY", source: "company_monnify_batch" });
  if (directDisbursement) evidence.push({ fundingRoute: PAYROLL_FUNDING_ROUTE.DIRECT_PROVIDER, provider: directDisbursement.provider === "PAYSTACK_COMPANY" ? "PAYSTACK" : "MONNIFY", source: "direct_provider_disbursement" });
  if (walletBatch) {
    // A persisted legacy EMS-wallet batch is already a route selection, even before
    // reservation. Being conservative prevents a prepared batch and a direct-provider
    // batch from racing to pay the same period through different funding paths.
    evidence.push({
      fundingRoute: normalizeRoute(walletBatch.fundingRoute || PAYROLL_FUNDING_ROUTE.EMS_WALLET),
      provider: normalizeProvider(walletBatch.provider),
      source: "ems_wallet_payout_batch",
    });
  }
  if (walletDisbursement) evidence.push({ fundingRoute: PAYROLL_FUNDING_ROUTE.EMS_WALLET, provider: normalizeProvider(walletDisbursement.provider), source: "ems_wallet_disbursement" });

  const unique = [...new Map(evidence.map((item) => [`${item.fundingRoute}:${item.provider}`, item])).values()];
  if (unique.length > 1) {
    throw new AppError("This payroll period has conflicting historical payout records across funding routes or providers. Reconcile the existing records before any new transfer; EMS has blocked another payout to prevent duplicate salary payments.", 409, {
      code: "PAYROLL_FUNDING_ROUTE_HISTORY_CONFLICT",
      details: { evidence: unique },
    });
  }
  return unique[0] || null;
};

/**
 * Atomically claims a payroll period for one funding route and provider.
 * Call only inside the same database transaction that creates the payout batch
 * or reserves wallet funds. This makes the payroll_period row the serialization
 * point shared by all payout implementations.
 */
export const claimPayrollFundingRoute = async (tx, {
  companyId,
  periodId,
  fundingRoute,
  provider,
}) => {
  const requested = assertPayrollFundingRouteCompatible({ requestedRoute: fundingRoute, requestedProvider: provider });
  const period = await tx.payrollPeriod.findFirst({
    where: { id: periodId, companyId, deletedAt: null },
    select: { id: true, payoutFundingRoute: true, payoutProvider: true },
  });
  if (!period) throw new AppError("Payroll period not found for this company.", 404);

  const existing = period.payoutFundingRoute
    ? { fundingRoute: normalizeRoute(period.payoutFundingRoute), provider: normalizeProvider(period.payoutProvider), source: "payroll_period_lock" }
    : await inferExistingRoute(tx, companyId, periodId);

  if (existing) {
    assertPayrollFundingRouteCompatible({
      currentRoute: existing.fundingRoute,
      currentProvider: existing.provider,
      requestedRoute: requested.fundingRoute,
      requestedProvider: requested.provider,
    });
  }

  if (period.payoutFundingRoute) {
    if (!period.payoutProvider) {
      await tx.payrollPeriod.updateMany({
        where: { id: periodId, companyId, deletedAt: null, payoutFundingRoute: requested.fundingRoute, payoutProvider: null },
        data: { payoutProvider: requested.provider, payoutRouteLockedAt: new Date() },
      });
    }
    return { ...requested, alreadyLocked: true };
  }

  const claimed = await tx.payrollPeriod.updateMany({
    where: { id: periodId, companyId, deletedAt: null, payoutFundingRoute: null },
    data: {
      payoutFundingRoute: requested.fundingRoute,
      payoutProvider: requested.provider,
      payoutRouteLockedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    const latest = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId }, select: { payoutFundingRoute: true, payoutProvider: true } });
    assertPayrollFundingRouteCompatible({
      currentRoute: latest?.payoutFundingRoute,
      currentProvider: latest?.payoutProvider,
      requestedRoute: requested.fundingRoute,
      requestedProvider: requested.provider,
    });
    if (!latest?.payoutFundingRoute) throw new AppError("Could not reserve this payroll period for payout. Refresh and try again.", 409, { code: "PAYROLL_FUNDING_ROUTE_LOCK_FAILED" });
  }
  return { ...requested, alreadyLocked: Boolean(existing) };
};
