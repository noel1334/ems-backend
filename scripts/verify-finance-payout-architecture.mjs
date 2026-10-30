import fs from 'node:fs';

const checks = [
  {
    file: 'src/modules/payroll/payroll.payout.config.js',
    required: ['provider !== "PAYSTACK"', 'PAYOUT_PROVIDER_NOT_ENABLED', 'PAYSTACK_SECRET_KEY'],
    forbidden: ['provider === "FLUTTERWAVE" ? "FLUTTERWAVE_SECRET_KEY"'],
  },
  {
    file: 'src/modules/payroll/payroll.payout.service.js',
    required: ['PRIMARY_SALARY_PAYOUT', 'WALLET_FUNDING_ONLY', 'verifyFlutterwaveTransfer', 'initiatePaystackTransfer', 'makePayrollPayoutReference(row.id, 1)', 'disbursementId: row.id', 'money(row.amount).toFixed(2)'],
    forbidden: ['initiateFlutterwaveTransfer', 'getFlutterwaveAvailableBalance', 'row.row'],
  },
];

let failed = false;
for (const check of checks) {
  if (!fs.existsSync(check.file)) {
    console.error(`MISSING ${check.file}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(check.file, 'utf8');
  const missing = check.required.filter((needle) => !content.includes(needle));
  const presentForbidden = check.forbidden.filter((needle) => content.includes(needle));
  if (missing.length || presentForbidden.length) {
    console.error(`FAIL ${check.file}`);
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (presentForbidden.length) console.error(`  forbidden: ${presentForbidden.join(', ')}`);
    failed = true;
  } else {
    console.log(`OK ${check.file}`);
  }
}
if (failed) process.exitCode = 1;
else console.log('Paystack-primary salary payout architecture checks passed. Structural only; no provider transfers were made.');
