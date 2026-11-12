import prisma from "../../../config/database.js";
import logger from "../../../config/logger.js";
import { getFundingStatus as getPaystackFundingStatus } from "../../payments/company-paystack/company-paystack.service.js";
import { getFundingStatus as getMonnifyFundingStatus } from "../../payments/monnify/monnify.service.js";

/**
 * Read-only company funding monitor. It refreshes provider-reported balances and
 * supported settlement details; it never moves money or credits the EMS ledger.
 * This is an in-process worker. Run one API instance, or disable it on extra
 * instances and use a single external scheduler to avoid duplicate polling.
 */
export function startProviderFundingMonitor({ intervalMs } = {}) {
  const enabled = String(process.env.PROVIDER_FUNDING_MONITOR_ENABLED ?? "true").trim().toLowerCase() !== "false";
  if (!enabled) return () => {};

  const configured = Number(intervalMs ?? process.env.PROVIDER_FUNDING_MONITOR_INTERVAL_MS ?? 900000);
  const delay = Number.isFinite(configured) ? Math.min(3600000, Math.max(60000, configured)) : 900000;
  let running = false;
  let stopped = false;

  const sweep = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const [paystackRows, monnifyRows] = await Promise.all([
        prisma.companyPaystackConnection.findMany({ where: { isActive: true }, select: { companyId: true } }),
        prisma.companyMonnifyConnection.findMany({ where: { isActive: true }, select: { companyId: true } }),
      ]);

      for (const row of paystackRows) {
        if (stopped) break;
        try {
          await getPaystackFundingStatus(row.companyId);
        } catch (error) {
          logger.warn({ companyId: row.companyId, error: error?.message }, "Paystack funding monitor refresh failed");
        }
      }

      for (const row of monnifyRows) {
        if (stopped) break;
        try {
          await getMonnifyFundingStatus(row.companyId);
        } catch (error) {
          logger.warn({ companyId: row.companyId, error: error?.message }, "Monnify funding monitor refresh failed");
        }
      }
    } catch (error) {
      logger.error({ error: error?.message }, "Company provider funding monitor sweep failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => { void sweep(); }, delay);
  timer.unref?.();
  void sweep();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
