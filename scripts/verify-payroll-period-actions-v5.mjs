import fs from 'node:fs';

const checks = [
  ['prisma/schema.prisma', ['model PayrollPeriod', 'deletedAt     DateTime?', '@@index([companyId, deletedAt, startDate])']],
  ['src/middleware/permission.middleware.js', ['isPayrollAdminDelete', 'payrollAdminRole', 'grantedBy: payrollAdminRole']],
  ['src/modules/payroll/payroll.controller.js', ['canArchiveFinancialHistory', 'FINANCE_ADMIN']],
  ['src/modules/payroll/payroll.service.js', ['financialHistoryPreserved', 'inFlightDisbursementCount', 'deletedAt: null']],
  ['src/modules/payroll/payroll.payout.service.js', ['deletedAt: null']],
  ['src/modules/payroll/payroll.repository.js', ['deletedAt: null']],
];
let failed = false;
for (const [file, snippets] of checks) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING ${file}`);
    failed = true;
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  if (missing.length) {
    console.error(`CHECK ${file}: missing ${missing.join(', ')}`);
    failed = true;
  } else {
    console.log(`OK ${file}`);
  }
}
if (failed) process.exitCode = 1;
else console.log('Payroll Period Actions V5 structural checks passed. Run Prisma db push/generate and the full project build/tests before production use.');
