import fs from 'node:fs';

const file = 'src/modules/self-service/self-service.service.js';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run this script from the EMS backend repository root.`);
let source = fs.readFileSync(file, 'utf8');
const marker = 'export const getMyPayslips = async';
const start = source.indexOf(marker);
if (start < 0) throw new Error(`Could not locate ${marker}. No changes were made.`);
const end = source.indexOf('\n};', start);
if (end < 0) throw new Error('Could not locate the end of getMyPayslips. No changes were made.');
const section = source.slice(start, end + 3);
if (section.includes('period: { is: { status: { in: ["FINALIZED", "PAID"] } } }')) {
  console.log('Payslip release filter is already applied.');
  process.exit(0);
}
const oldLine = 'const where = { companyId, employeeId };';
if (!section.includes(oldLine)) throw new Error('Expected payroll query filter was not found inside getMyPayslips. No changes were made.');
const nextSection = section.replace(oldLine, 'const where = { companyId, employeeId, period: { is: { status: { in: ["FINALIZED", "PAID"] } } } };');
source = source.slice(0, start) + nextSection + source.slice(end + 3);
fs.writeFileSync(file, source);
console.log('Updated self-service payslips to return finalized/paid payroll periods only.');
