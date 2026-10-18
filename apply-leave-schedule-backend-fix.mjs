import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "src/common/validators/zod.js",
  "src/modules/leave/leave.validators.js",
  "src/modules/leave/leave.service.js",
  "src/modules/schedules/schedule.service.js",
  "src/modules/schedules/schedule.repository.js",
];
for (const file of targets) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing ${file}. Run this script from the backend repository root.`);
    process.exit(1);
  }
}
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }

// Express 5 exposes req.query as a getter. Assigning req.query = parsedData throws
// and causes GET /leave/types, /leave/balances and /leave/requests to return 500.
{
  const file = "src/common/validators/zod.js";
  let source = read(file);
  const patched = `export const validate = (schema, target = "body") => (req, res, next) => {
  const result = schema.safeParse(req[target]);
  if (!result.success) return next(new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: result.error.flatten() }));

  // Keep validated inputs in a stable place for services. Express 5 implements
  // req.query as a getter, so redefine it as an own data property instead of
  // assigning through the getter (which raises a TypeError and becomes HTTP 500).
  req.validated = { ...(req.validated ?? {}), [target]: result.data };
  if (target === "query") {
    Object.defineProperty(req, "query", { configurable: true, enumerable: true, writable: true, value: result.data });
  } else {
    req[target] = result.data;
  }
  return next();
};`;
  const regex = /export const validate = \(schema, target = "body"\) => \(req, res, next\) => \{[\s\S]*?\n\};/;
  if (!source.includes("Object.defineProperty(req, \"query\"")) {
    if (!regex.test(source)) throw new Error("Could not locate validate() in src/common/validators/zod.js");
    source = source.replace(regex, patched);
    write(file, source);
  }
}

// Validate leave types against Prisma's actual LeaveType model; it has name/code,
// entitlement and policy fields, not a free-form `description` or enum column.
{
  const file = "src/modules/leave/leave.validators.js";
  const source = read(file);
  const updated = `import { z } from "zod";

const passthrough = z.object({}).passthrough();
const nonNegative = z.coerce.number().finite().min(0);
const leaveTypeFields = {
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Code can contain letters, numbers, hyphens and underscores"),
  annualEntitlement: nonNegative.default(0),
  carryForwardAllowed: z.boolean().default(false),
  maxCarryForward: nonNegative.default(0),
  requiresApproval: z.boolean().default(true),
  approvalLevels: z.coerce.number().int().min(1).max(5).default(1),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
};
export const leaveTypeCreateSchema = z.object(leaveTypeFields);
export const leaveTypeUpdateSchema = z.object(leaveTypeFields).partial();
export const leaveRequestCreateSchema = passthrough;
export const leaveRequestUpdateSchema = passthrough;
export const approvalSchema = passthrough;
export const rejectionSchema = passthrough;
export const balanceInitializeSchema = passthrough;
export const balanceAdjustmentSchema = passthrough;
const queryBoolean = z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional();
export const typeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  isActive: queryBoolean,
}).passthrough();
export const balanceListSchema = typeListSchema;
export const requestListSchema = typeListSchema;
`;
  if (source !== updated) write(file, updated);
}

// Use validated pagination and normalized isActive filters, and return a standard
// totalPages field for the existing frontend paginator.
{
  const file = "src/modules/leave/leave.service.js";
  let source = read(file);
  const regex = /export async function listTypes\(req\) \{[\s\S]*?\n\}/;
  const replacement = `export async function listTypes(req) {
  const cid = companyId(req);
  const q = req.validated?.query ?? req.query ?? {};
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit, 10) || 20));
  const where = {
    ...(q.search ? { OR: [
      { name: { contains: String(q.search), mode: "insensitive" } },
      { code: { contains: String(q.search), mode: "insensitive" } },
    ] } : {}),
    ...(typeof q.isActive === "boolean" ? { isActive: q.isActive } : {}),
  };
  const [items, total] = await repo.listTypes(cid, where, (page - 1) * limit, limit);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit), totalPages: Math.ceil(total / limit) } };
}`;
  if (!source.includes('totalPages: Math.ceil(total / limit)')) {
    if (!regex.test(source)) throw new Error("Could not locate listTypes() in src/modules/leave/leave.service.js");
    source = source.replace(regex, replacement);
    write(file, source);
  }
}

// Scope schedule-conflict checks and deactivate-primary updates to the same company.
{
  const file = "src/modules/schedules/schedule.service.js";
  let source = read(file);
  source = source.replace(/findScheduleAssignmentConflict\(\{\s*employeeId,/g, "findScheduleAssignmentConflict({\n      companyId,\n      employeeId,");
  source = source.replace(/findShiftAssignmentConflict\(\{\s*employeeId,/g, "findShiftAssignmentConflict({\n      companyId,\n      employeeId,");
  source = source.replace(/return createEmployeeScheduleAssignment\(\s*\{\s*(?!companyId,)employeeId,/, "return createEmployeeScheduleAssignment({\n          companyId,\n          employeeId,");
  source = source.replace(/return createEmployeeShiftAssignment\(\s*\{\s*(?!companyId,)employeeId,/, "return createEmployeeShiftAssignment({\n          companyId,\n          employeeId,");
  // Include companyId in updateMany filters in the two assignment functions.
  const scheduleStart = source.indexOf("export const assignToEmployee");
  const scheduleEnd = source.indexOf("export const getEmployeeSchedules", scheduleStart);
  if (scheduleStart < 0 || scheduleEnd < 0) throw new Error("Could not locate schedule assignment service block");
  let a = source.slice(scheduleStart, scheduleEnd);
  a = a.replace(/where:\s*\{\s*employeeId,\s*isActive:\s*true,/g, "where: { companyId, employeeId, isActive: true,");
  source = source.slice(0, scheduleStart) + a + source.slice(scheduleEnd);
  const shiftStart = source.indexOf("export const assignShiftToEmployee");
  const shiftEnd = source.indexOf("export const getEmployeeShifts", shiftStart);
  if (shiftStart < 0 || shiftEnd < 0) throw new Error("Could not locate shift assignment service block");
  let b = source.slice(shiftStart, shiftEnd);
  b = b.replace(/where:\s*\{\s*employeeId,\s*isActive:\s*true,/g, "where: { companyId, employeeId, isActive: true,");
  source = source.slice(0, shiftStart) + b + source.slice(shiftEnd);
  write(file, source);
}

// Keep overlap checks tenant-scoped as well.
{
  const file = "src/modules/schedules/schedule.repository.js";
  let source = read(file);
  for (const [name, nextName] of [
    ["export const findScheduleAssignmentConflict", "export const findEmployeeScheduleAssignments"],
    ["export const findShiftAssignmentConflict", "export const findEmployeeShiftAssignments"],
  ]) {
    const start = source.indexOf(name);
    const end = source.indexOf(nextName, start + name.length);
    if (start < 0 || end < 0) throw new Error(`Could not locate ${name} block`);
    let block = source.slice(start, end);
    block = block.replace(/async \(\{\s*(?!companyId,)employeeId,/, "async ({ companyId, employeeId,");
    block = block.replace(/where:\s*\{\s*employeeId,\s*isActive:\s*true,/g, "where: { ...(companyId ? { companyId } : {}), employeeId, isActive: true,");
    source = source.slice(0, start) + block + source.slice(end);
  }
  write(file, source);
}

console.log("Applied Express 5 query-validation, Prisma-aligned leave types, and company-scoped schedule-assignment fixes.");
