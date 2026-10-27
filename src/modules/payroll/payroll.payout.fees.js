import Decimal from "decimal.js";
import AppError from "../../common/errors/AppError.js";
import { estimatePaystackTransferFee } from "./payroll.payout.config.js";
import { getFlutterwaveTransferFee } from "../payments/flutterwave/flutterwave.transfer.client.js";

const money = (value) => new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const estimatePayrollPayoutFee = async (provider, amount) => {
  const salary = money(amount);
  if (!salary.isFinite() || !salary.isPositive()) throw new AppError("Salary amount must be greater than zero before fee estimation.", 400);
  if (provider === "PAYSTACK") return money(estimatePaystackTransferFee(salary.toFixed(2))).toFixed(2);
  if (provider === "FLUTTERWAVE") {
    let quoted;
    try {
      quoted = await getFlutterwaveTransferFee(salary.toFixed(2));
    } catch (error) {
      throw new AppError(
        `Unable to obtain Flutterwave bank-transfer fee: ${error?.message || "fee quote unavailable"}`,
        502,
        { code: "PAYOUT_FEE_QUOTE_FAILED" }
      );
    }
    const fee = money(quoted.fee);
    if (!fee.isFinite() || fee.isNegative()) throw new AppError("Flutterwave returned an invalid bank-transfer fee.", 502);
    return fee.toFixed(2);
  }
  throw new AppError("Choose Paystack or Flutterwave to estimate payout fees.", 400);
};

export const providerReportedPayoutFee = (provider, response) => {
  if (provider === "PAYSTACK") {
    const raw = response?.data?.fee_charged ?? response?.data?.fee;
    if (raw === undefined || raw === null || raw === "") return null;
    // Paystack transfer objects expose fee_charged in kobo.
    return money(new Decimal(raw).div(100)).toFixed(2);
  }
  if (provider === "FLUTTERWAVE") {
    const raw = response?.data?.fee;
    if (raw === undefined || raw === null || raw === "") return null;
    return money(raw).toFixed(2);
  }
  return null;
};
