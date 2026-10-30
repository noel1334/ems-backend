import fs from 'node:fs';

const required = [
  ['prisma/schema.prisma', ['model PayrollDisbursement', 'providerTransferId', 'providerStatus', 'providerResponse', 'model EmployeeBankAccount', 'paystackBankCode', 'flutterwaveBankCode', 'model WalletLedgerEntry']],
  ['src/modules/payroll/payroll.routes.js', ['/disbursements/execute', '/disbursements/:disbursementId/verify']],
  ['src/modules/payroll/payroll.controller.js', ['executePayrollPayouts', 'verifyPayrollPayout']],
  ['src/modules/payroll/payroll.payout.service.js', ['PAYROLL_PAYOUTS_ENABLED', 'debitWalletInTransaction', 'creditWalletInTransaction', 'verifyPaystackTransfer', 'verifyFlutterwaveTransfer', 'PRIMARY_SALARY_PAYOUT', 'WALLET_FUNDING_ONLY', 'only enabled provider for new automated salary payouts']],
  ['src/modules/payments/paystack/paystack.transfer.client.js', ['/transferrecipient', '/transfer', '/transfer/verify/']],
  ['src/modules/payments/flutterwave/flutterwave.transfer.client.js', ['/transfers']],
];
let failed = false;
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) { console.error(`MISSING ${file}`); failed = true; continue; }
  const content = fs.readFileSync(file, 'utf8');
  const missing = needles.filter((needle) => !content.includes(needle));
  if (missing.length) { console.error(`CHECK ${file}: missing ${missing.join(', ')}`); failed = true; }
  else console.log(`OK ${file}`);
}
if (failed) process.exitCode = 1;
else console.log('Finance Phase 5 files and expected schema/routes are present. Structural check only; it does not perform live provider transfers.');
