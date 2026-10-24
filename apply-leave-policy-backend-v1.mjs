import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  schema: path.join(root, 'prisma/schema.prisma'),
  validators: path.join(root, 'src/modules/leave/leave.validators.js'),
  service: path.join(root, 'src/modules/leave/leave.service.js'),
};
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${name} file: ${file}. Run this script from the EMS backend root.`);
}
function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one matching source block, found ${count}. No files have been written yet.`);
  return source.replace(before, after);
}
let schema = fs.readFileSync(files.schema, 'utf8');
let validators = fs.readFileSync(files.validators, 'utf8');
let service = fs.readFileSync(files.service, 'utf8');

if (!schema.includes('minNoticeDays')) {
  schema = replaceOnce(schema,
`  annualEntitlement   Decimal                   @default(0) @db.Decimal(10, 2)\n  carryForwardAllowed Boolean                   @default(false)`,
`  annualEntitlement   Decimal                   @default(0) @db.Decimal(10, 2)\n  minNoticeDays       Int                       @default(0)\n  maxConsecutiveDays  Int?\n  requiresReason      Boolean                   @default(false)\n  allowHalfDay        Boolean                   @default(true)\n  carryForwardAllowed Boolean                   @default(false)`, 'LeaveType schema fields');
}

if (!validators.includes('minNoticeDays:')) {
  validators = replaceOnce(validators,
`  annualEntitlement: nonNegative.default(0),\n  carryForwardAllowed: z.boolean().default(false),`,
`  annualEntitlement: nonNegative.default(0),\n  minNoticeDays: z.coerce.number().int().min(0).max(365).default(0),\n  maxConsecutiveDays: z.union([z.coerce.number().int().min(1).max(366), z.null()]).default(null),\n  requiresReason: z.boolean().default(false),\n  allowHalfDay: z.boolean().default(true),\n  carryForwardAllowed: z.boolean().default(false),`, 'LeaveType validation fields');
}

if (!service.includes('function assertLeavePolicy')) {
  service = replaceOnce(service,
`const yearOf = (d) => d.getFullYear();\n\nasync function workingDays`,
`const yearOf = (d) => d.getFullYear();\n\nfunction assertLeavePolicy(type, { start, days, duration, reason }) {\n  if (duration === "HALF_DAY" && type.allowHalfDay === false) {\n    throw new AppError("Half-day leave is not allowed for this leave type", 400);\n  }\n  if (type.requiresReason && !String(reason ?? "").trim()) {\n    throw new AppError("A reason is required for this leave type", 400);\n  }\n  const noticeDays = Number(type.minNoticeDays ?? 0);\n  if (noticeDays > 0) {\n    const today = new Date();\n    today.setHours(0, 0, 0, 0);\n    const requestedStart = new Date(start);\n    requestedStart.setHours(0, 0, 0, 0);\n    const daysNotice = Math.floor((requestedStart.getTime() - today.getTime()) / 86400000 + 0.5);\n    if (daysNotice < noticeDays) {\n      throw new AppError(\`This leave type requires at least \${noticeDays} calendar day(s) of advance notice\`, 400);\n    }\n  }\n  if (type.maxConsecutiveDays != null && D(days).gt(type.maxConsecutiveDays)) {\n    throw new AppError(\`This leave type allows a maximum of \${type.maxConsecutiveDays} working day(s) per request\`, 400);\n  }\n}\n\nasync function workingDays`, 'Leave policy enforcement helper');
}

const createDaysBlock = `    const days = duration === "HALF_DAY" ? D(0.5) : await workingDays(cid, p.employeeId, start, end, tx);\n    if (days.isZero() || days.isNegative()) throw new AppError("Leave period contains no working days", 400);`;
if (!service.includes('assertLeavePolicy(t, { start, days, duration, reason: p.reason });')) {
  service = replaceOnce(service, createDaysBlock,
`${createDaysBlock}\n    assertLeavePolicy(t, { start, days, duration, reason: p.reason });`, 'Create request policy enforcement');
}

const updateDaysBlock = `    const days = duration === "HALF_DAY" ? D(0.5) : await workingDays(cid, r.employeeId, start, end, tx);\n    if (days.isZero() || days.isNegative()) throw new AppError("Leave period contains no working days", 400);`;
if (!service.includes('assertLeavePolicy(r.leaveType, { start, days, duration, reason: p.reason !== undefined ? p.reason : r.reason });')) {
  service = replaceOnce(service, updateDaysBlock,
`${updateDaysBlock}\n    assertLeavePolicy(r.leaveType, { start, days, duration, reason: p.reason !== undefined ? p.reason : r.reason });`, 'Update request policy enforcement');
}

// Write only after every expected replacement succeeded.
fs.writeFileSync(files.schema, schema);
fs.writeFileSync(files.validators, validators);
fs.writeFileSync(files.service, service);
console.log('Leave policy backend patch applied.');
console.log('Added tenant-scoped LeaveType policy fields: minNoticeDays, maxConsecutiveDays, requiresReason, allowHalfDay.');
console.log('Enforcement is applied to create and edit requests; Prisma db push will synchronize the schema.');
