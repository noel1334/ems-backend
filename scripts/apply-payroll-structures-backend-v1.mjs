import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const patchDir = path.resolve(scriptDir, "../payroll-structures-patch-files");
const payrollDir = path.join(root, "src/modules/payroll");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(payrollDir, "payroll.service.js"))) {
  console.error("Run this script from the root of ems-backend (the folder containing package.json and src/modules/payroll).");
  process.exit(1);
}
if (!fs.existsSync(patchDir)) {
  const service = fs.readFileSync(path.join(payrollDir, "payroll.service.js"), "utf8");
  const routes = fs.readFileSync(path.join(payrollDir, "payroll.routes.js"), "utf8");
  const validators = fs.readFileSync(path.join(payrollDir, "payroll.validators.js"), "utf8");
  if (service.includes("Nested component creation is atomic") && service.includes("export const updateComponent = async") && routes.includes("componentUpdateSchema") && validators.includes("componentUpdateSchema")) {
    console.log("Payroll Structures backend V1 already appears to be applied; no changes made.");
    process.exit(0);
  }
  throw new Error("The patch-assets folder is missing. Re-extract the backend patch ZIP into the project root, then run this script again.");
}

const updates = new Map();
const get = (relative) => updates.has(relative) ? updates.get(relative) : read(relative);
const set = (relative, content) => updates.set(relative, content);
const snippet = (name) => fs.readFileSync(path.join(patchDir, name), "utf8").trimEnd();

// Keep both historical validator filenames synchronised; the active router imports payroll.validators.js.
set("src/modules/payroll/payroll.validators.js", snippet("payroll.validators.js") + "\n");
set("src/modules/payroll/payroll.validation.js", snippet("payroll.validation.js") + "\n");

// Atomic structure + template-component creation.
{
  const file = "src/modules/payroll/payroll.service.js";
  let source = get(file);
  const startMarker = "export const createStructure = async (companyId, data) => {";
  const endMarker = "\nexport const listStructures = async";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not safely locate createStructure in ${file}.`);
  source = source.slice(0, start) + snippet("payroll-service-create-structure.snippet") + source.slice(end);

  {
    const updateStartMarker = "export const updateStructure = async (companyId, structureId, data) => {";
    const updateEndMarker = "\nexport const deactivateStructure = async";
    const updateStart = source.indexOf(updateStartMarker);
    const updateEnd = source.indexOf(updateEndMarker, updateStart);
    if (updateStart < 0 || updateEnd < 0) throw new Error(`Could not safely locate updateStructure in ${file}.`);
    source = source.slice(0, updateStart) + snippet("payroll-service-update-structure.snippet") + source.slice(updateEnd);
  }

  if (!source.includes("export const updateComponent = async")) {
    const marker = "\nexport const assignSalary = async (companyId, data) => {";
    if (!source.includes(marker)) throw new Error(`Could not locate component-service insertion point in ${file}.`);
    source = source.replace(marker, "\n" + snippet("payroll-service-component-crud.snippet") + marker);
  }
  source = source.replace(
    "data.percentage === undefined\n          ? null",
    "(data.percentage === undefined || data.percentage === null)\n          ? null",
  );
  set(file, source);
}

// Add controller handlers using the existing controller/service conventions.
{
  const file = "src/modules/payroll/payroll.controller.js";
  let source = get(file);
  if (!source.includes("updateComponent as updatePayrollComponent")) {
    const marker = "  addComponent,\n";
    if (!source.includes(marker)) throw new Error(`Could not locate component service import in ${file}.`);
    source = source.replace(marker, marker + "  updateComponent as updatePayrollComponent,\n  deactivateComponent,\n");
  }
  if (!source.includes("export const updateComponent = async")) {
    const marker = "export const createSalary = async (req, res) => {";
    const handlers = `export const updateComponent = async (req, res) => {
  return success(
    res,
    await updatePayrollComponent(
      getCompanyId(req),
      req.params.structureId,
      req.params.componentId,
      req.body
    )
  );
};

export const deleteComponent = async (req, res) => {
  return success(
    res,
    await deactivateComponent(
      getCompanyId(req),
      req.params.structureId,
      req.params.componentId
    )
  );
};

`;
    if (!source.includes(marker)) throw new Error(`Could not locate controller handler insertion point in ${file}.`);
    source = source.replace(marker, handlers + marker);
  }
  set(file, source);
}

// Add component update/deactivate routes with tenant ownership and existing payroll permissions.
{
  const file = "src/modules/payroll/payroll.routes.js";
  let source = get(file);
  if (!source.includes("componentUpdateSchema")) {
    const marker = "  componentSchema,\n";
    if (!source.includes(marker)) throw new Error(`Could not locate validator import in ${file}.`);
    source = source.replace(marker, marker + "  componentUpdateSchema,\n");
  }
  if (!source.includes('"/structures/:structureId/components/:componentId"')) {
    const anchor = `router.post(
  "/structures/:structureId/components",
  requirePermission("payroll", "structures", "UPDATE"),
  validate(componentSchema),
  asyncHandler(controller.createComponent)
);`;
    const addition = `${anchor}

router.patch(
  "/structures/:structureId/components/:componentId",
  requirePermission("payroll", "structures", "UPDATE"),
  validate(componentUpdateSchema),
  asyncHandler(controller.updateComponent)
);

// Keep component history: DELETE deactivates rather than physically removing a row.
router.delete(
  "/structures/:structureId/components/:componentId",
  requirePermission("payroll", "structures", "UPDATE"),
  asyncHandler(controller.deleteComponent)
);`;
    if (!source.includes(anchor)) throw new Error(`Could not locate component-create route in ${file}.`);
    source = source.replace(anchor, addition);
  }
  set(file, source);
}

// Ensure all anchors were matched before writing any files, then retain a temporary rollback copy.
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ems-payroll-structures-v1-backup-"));
for (const [relative, content] of updates) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) fs.copyFileSync(destination, path.join(backupDir, relative.replaceAll("/", "__")));
  fs.writeFileSync(destination, content);
}
console.log("Payroll Structures backend V1 applied.");
console.log("Updated:", [...updates.keys()].join(", "));
console.log(`Rollback copies of overwritten files: ${backupDir}`);
fs.rmSync(patchDir, { recursive: true, force: true });
console.log("Temporary patch assets were removed after successful application.");
console.log("No Prisma schema migration is expected; the current schema already contains payroll structures and components.");
