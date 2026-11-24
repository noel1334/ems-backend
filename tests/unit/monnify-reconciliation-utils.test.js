import { describe, expect, it } from "vitest";
import {
  monnifyTransactionFailureReason,
  monnifyTransactionReference,
  monnifyTransactionStatus,
  normalizeMonnifyTransactionMap,
  unwrapMonnifyTransactionRows,
  isMonnifyBatchFullyReconciled,
  monnifyBatchNeedsReconciliation,
} from "../../src/modules/payments/monnify/monnify.reconciliation.utils.js";

describe("Monnify payroll reconciliation response mapping", () => {
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


describe("Monnify completed-batch reconciliation polling", () => {
  const terminalRows = [
    { status: "PAID" },
    { status: "PAID" },
    { status: "FAILED" },
  ];

  it("continues polling a COMPLETED provider batch until every payroll row is reconciled", () => {
    const batch = { providerStatus: "COMPLETED", totalTransactions: 3 };
    expect(monnifyBatchNeedsReconciliation(batch, [
      { status: "PAID" },
      { status: "PROCESSING" },
      { status: "FAILED" },
    ])).toBe(true);
    expect(monnifyBatchNeedsReconciliation(batch, terminalRows)).toBe(false);
  });

  it("continues polling an authorized batch even when the mapped rows already look terminal", () => {
    expect(monnifyBatchNeedsReconciliation(
      { providerStatus: "AWAITING_PROCESSING", totalTransactions: 3 },
      terminalRows,
    )).toBe(true);
  });

  it("does not poll a definitively rejected batch", () => {
    expect(monnifyBatchNeedsReconciliation(
      { providerStatus: "SUBMISSION_REJECTED", totalTransactions: 3 },
      [{ status: "PENDING" }, { status: "PENDING" }, { status: "PENDING" }],
    )).toBe(false);
  });
});
