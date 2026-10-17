import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma/schema.prisma');
const routesPath = path.join(root, 'src/modules/platform/platform.routes.js');
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

if (!fs.existsSync(schemaPath) || !fs.existsSync(routesPath)) {
  console.error('Run this script from the EMS backend repository root (the folder containing prisma/ and src/).');
  process.exit(1);
}

let schema = read(schemaPath);
if (!schema.includes('enum HolidayType {')) {
  const dayEnum = /enum DayOfWeek \{[\s\S]*?\n\}/;
  if (!dayEnum.test(schema)) throw new Error('Could not find enum DayOfWeek in Prisma schema.');
  schema = schema.replace(dayEnum, (m) => `${m}\n\nenum HolidayType {\n  PUBLIC\n  COMPANY\n  OPTIONAL\n  RELIGIOUS\n  OTHER\n}`);
}
const holidayBlockMatch = schema.match(/model Holiday \{[\s\S]*?\n\}/);
if (!holidayBlockMatch) throw new Error('Could not find model Holiday in Prisma schema.');
if (!/holidayType\s+HolidayType/.test(holidayBlockMatch[0])) {
  const updated = holidayBlockMatch[0].replace(/(\n[ \t]*description[ \t]+String\?[ \t]*)/, '$1\n  holidayType HolidayType @default(COMPANY)');
  if (updated === holidayBlockMatch[0]) throw new Error('Could not find Holiday.description field to add holidayType.');
  schema = schema.replace(holidayBlockMatch[0], updated);
}
write(schemaPath, schema);

let routes = read(routesPath);
if (!routes.includes('platform.workforce.controller.js')) {
  const importAnchor = /import \* as templateController from "\.\/role-template\.controller\.js";?/;
  if (!importAnchor.test(routes)) throw new Error('Could not find platform role-template controller import.');
  routes = routes.replace(importAnchor, (m) => `${m}\nimport * as workforceController from "./platform.workforce.controller.js";`);
}
const marker = '// Workforce calendar platform endpoints (all protected by requireSuperAdmin above).';
if (!routes.includes(marker)) {
  const block = `
${marker}
router.get("/tenants/:id/shifts", workforceController.listShifts);
router.post("/tenants/:id/shifts", workforceController.createShift);
router.get("/tenants/:id/shifts/:resourceId", workforceController.getShift);
router.patch("/tenants/:id/shifts/:resourceId", workforceController.updateShift);
router.delete("/tenants/:id/shifts/:resourceId", workforceController.deleteShift);
router.post("/tenants/:id/shifts/:resourceId/breaks", workforceController.addShiftBreak);
router.patch("/tenants/:id/shifts/:resourceId/breaks/:breakId", workforceController.updateShiftBreak);
router.delete("/tenants/:id/shifts/:resourceId/breaks/:breakId", workforceController.deleteShiftBreak);

router.get("/tenants/:id/schedules", workforceController.listSchedules);
router.post("/tenants/:id/schedules", workforceController.createSchedule);
router.get("/tenants/:id/schedules/employees/:employeeId/shifts", workforceController.getEmployeeShifts);
router.post("/tenants/:id/schedules/employees/:employeeId/shifts", workforceController.assignEmployeeShift);
router.get("/tenants/:id/schedules/employees/:employeeId", workforceController.getEmployeeSchedules);
router.post("/tenants/:id/schedules/employees/:employeeId", workforceController.assignEmployeeSchedule);
router.get("/tenants/:id/schedules/:resourceId", workforceController.getSchedule);
router.patch("/tenants/:id/schedules/:resourceId", workforceController.updateSchedule);
router.put("/tenants/:id/schedules/:resourceId/days", workforceController.replaceScheduleDays);
router.delete("/tenants/:id/schedules/:resourceId", workforceController.deleteSchedule);

router.get("/tenants/:id/holidays", workforceController.listHolidays);
router.post("/tenants/:id/holidays", workforceController.createHoliday);
router.get("/tenants/:id/holidays/:resourceId", workforceController.getHoliday);
router.patch("/tenants/:id/holidays/:resourceId", workforceController.updateHoliday);
router.delete("/tenants/:id/holidays/:resourceId", workforceController.deleteHoliday);

router.get("/tenants/:id/scheduling/generations", workforceController.listGenerations);
router.get("/tenants/:id/scheduling/generations/:generationId", workforceController.getGeneration);
`;
  if (!routes.includes('export default router;')) throw new Error('Could not find platform route export.');
  routes = routes.replace('export default router;', `${block}\nexport default router;`);
}
write(routesPath, routes);
console.log('Applied workforce calendar schema and protected platform routes.');
