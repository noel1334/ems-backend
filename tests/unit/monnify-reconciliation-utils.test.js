import { describe, expect, it } from "vitest";
import {
  monnifyTransactionFailureReason,
  monnifyTransactionReference,
  monnifyTransactionStatus,
  normalizeMonnifyTransactionStatus,
  normalizeMonnifyTransactionMap,
  unwrapMonnifyTransactionRows,
  isMonnifyBatchFullyReconciled,
  MONNIFY_FINAL_PAID_STATUSES,
  MONNIFY_FINAL_FAILED_STATUSES,
} from "../../src/modules/payments/monnify/monnify.reconciliation.utils.js";

describe("Monnify payroll reconciliation response mapping", () => {
  it("defines final provider statuses used by reconciliation and retry protection", () => {
    expect(MONNIFY_FINAL_PAID_STATUSES.has("SUCCESS")).toBe(true);
    expect(MONNIFY_FINAL_FAILED_STATUSES.has("FAILED")).toBe(true);
    expect(MONNIFY_FINAL_FAILED_STATUSES.has("REVERSED")).toBe(true);
    expect(MONNIFY_FINAL_FAILED_STATUSES.has("EXPIRED")).toBe(true);
  });

  it("unwraps the content wrapper returned by the bulk transaction endpoint", () => {
    const rows = [{ reference: "EMS-ONE", status: "SUCCESS" }];
    expect(unwrapMonnifyTransactionRows({ responseBody: { data: { content: rows } } })).toEqual(rows);
  });

  it("reads provider references and statuses from common Monnify response fields", () => {
    expect(monnifyTransactionReference({ paymentReference: " EMS-PAY-1 " })).toBe("EMS-PAY-1");
    expect(monnifyTransactionReference({ transaction: { reference: "EMS-PAY-2" } })).toBe("EMS-PAY-2");
    expect(monnifyTransactionStatus({ transactionStatus: "success" })).toBe("SUCCESS");
    expect(monnifyTransactionStatus({ paymentStatus: "failed" })).toBe("FAILED");
  });


  it("normalizes provider success labels to a final paid status", () => {
    for (const value of ["SUCCESS", "successful", "Completed", "TRANSFER_SUCCESSFUL", "successful transaction"]) {
      expect(normalizeMonnifyTransactionStatus(value)).toBe("SUCCESS");
    }
    expect(monnifyTransactionStatus({ responseBody: { transactionStatus: "SUCCESSFUL" } })).toBe("SUCCESS");
  });

  it("reads nested transaction references and transfer status fields", () => {
    expect(monnifyTransactionReference({ transaction: { transactionReferenceNo: "EMS-NESTED" } })).toBe("EMS-NESTED");
    expect(monnifyTransactionStatus({ transferStatus: "successful" })).toBe("SUCCESS");
  });

  it("preserves the actual provider failure comment for employee payroll rows", () => {
    expect(monnifyTransactionFailureReason({ status: "FAILED", comment: "Invalid Bank Code" }, "FAILED")).toBe("Invalid Bank Code");
    expect(monnifyTransactionFailureReason({ status: "SUCCESS", comment: "Transaction successful" }, "SUCCESS")).toBeNull();
    expect(monnifyTransactionFailureReason({}, "REVERSED")).toMatch(/reversed/i);
  });

  it("classifies the uploaded five-transfer report as two successes and three failures", () => {
    const rows = [
      { reference: "EMS-1", status: "FAILED", comment: "Invalid Bank Code" },
      { reference: "EMS-2", status: "FAILED", comment: "Invalid Bank Code" },
      { reference: "EMS-3", status: "SUCCESS", comment: "Transaction successful" },
      { reference: "EMS-4", status: "SUCCESS", comment: "Transaction successful" },
      { reference: "EMS-5", status: "FAILED", comment: "Invalid Bank Code" },
    ];
    const statuses = rows.map(monnifyTransactionStatus);
    expect(statuses.filter((status) => status === "SUCCESS")).toHaveLength(2);
    expect(statuses.filter((status) => status === "FAILED")).toHaveLength(3);
    expect(rows.filter((row) => monnifyTransactionFailureReason(row, row.status) === "Invalid Bank Code")).toHaveLength(3);
  });

  it("clears an aggregate open-batch lock only after every submitted beneficiary has a terminal result", () => {
    const batch = { totalTransactions: 5 };
    expect(isMonnifyBatchFullyReconciled(batch, [
      { status: "PAID" },
      { status: "PAID" },
      { status: "FAILED" },
      { status: "FAILED" },
      { status: "FAILED" },
    ])).toBe(true);
    expect(isMonnifyBatchFullyReconciled(batch, [
      { status: "PAID" },
      { status: "PAID" },
      { status: "FAILED" },
      { status: "FAILED" },
      { status: "PROCESSING" },
    ])).toBe(false);
    expect(isMonnifyBatchFullyReconciled(batch, [
      { status: "PAID" },
      { status: "FAILED" },
    ])).toBe(false);
  });

  it("supports both current object maps and older reference-map arrays", () => {
    expect(normalizeMonnifyTransactionMap({ _emsTransactionMap: { "EMS-1": "disb-1" } })).toEqual({ "EMS-1": "disb-1" });
    expect(normalizeMonnifyTransactionMap({ response: { _emsTransactionMap: [{ reference: "EMS-2", disbursementId: "disb-2" }] } })).toEqual({ "EMS-2": "disb-2" });
  });
});
