import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const moduleDir = path.join(root, "src/modules/schedules");
const patchDir = fileURLToPath(new URL("../patches/attendance-calendar-v1/", import.meta.url));
const paths = {
  repository: path.join(moduleDir, "schedule.repository.js"),
  service: path.join(moduleDir, "schedule.service.js"),
  controller: path.join(moduleDir, "schedule.controller.js"),
  routes: path.join(moduleDir, "schedule.routes.js"),
};
const [repository, service, controller, routes, repositoryFragment, serviceFragment, controllerFragment] = await Promise.all([
  fs.readFile(paths.repository, "utf8"),
  fs.readFile(paths.service, "utf8"),
  fs.readFile(paths.controller, "utf8"),
  fs.readFile(paths.routes, "utf8"),
  fs.readFile(path.join(patchDir, "schedule-calendar.repository.fragment.js"), "utf8"),
  fs.readFile(path.join(patchDir, "schedule-calendar.service.fragment.js"), "utf8"),
  fs.readFile(path.join(patchDir, "schedule-calendar.controller.fragment.js"), "utf8"),
]);
let nextRepository = repository;
let nextService = service;
let nextController = controller;
let nextRoutes = routes;

if (!nextRepository.includes("export const getAttendanceCalendarData")) nextRepository = `${nextRepository.trimEnd()}\n\n${repositoryFragment.trim()}\n`;
if (!nextService.includes("export const getAttendanceCalendar = async")) {
  const importAnchor = '  findEmployeeShiftAssignments,\n} from "./schedule.repository.js";';
  if (!nextService.includes(importAnchor)) throw new Error("Could not locate schedule repository imports; no backend files were changed.");
  nextService = nextService.replace(importAnchor, '  findEmployeeShiftAssignments,\n  getAttendanceCalendarData,\n} from "./schedule.repository.js";');
  nextService = `${nextService.trimEnd()}\n\n${serviceFragment.trim()}\n`;
}
if (!nextController.includes("export const getAttendanceCalendar = async")) nextController = `${nextController.trimEnd()}\n\n${controllerFragment.trim()}\n`;
if (!nextRoutes.includes("getAttendanceCalendar")) {
  const importAnchor = '    getEmployeeShifts,\n} from "./schedule.controller.js";';
  const routeAnchor = 'router.get(\n    "/:id",';
  if (!nextRoutes.includes(importAnchor) || !nextRoutes.includes(routeAnchor)) throw new Error("Could not locate schedule route anchors; no backend files were changed.");
  nextRoutes = nextRoutes.replace(importAnchor, '    getEmployeeShifts,\n    getAttendanceCalendar,\n} from "./schedule.controller.js";');
  nextRoutes = nextRoutes.replace(routeAnchor, 'router.get(\n    "/calendar",\n    requirePermission(\n        "schedules",\n        "schedule",\n        "READ"\n    ),\n    getAttendanceCalendar\n);\n\n' + routeAnchor);
}

await Promise.all([
  fs.writeFile(paths.repository, nextRepository),
  fs.writeFile(paths.service, nextService),
  fs.writeFile(paths.controller, nextController),
  fs.writeFile(paths.routes, nextRoutes),
]);
console.log("Attendance calendar backend applied: tenant-scoped schedule assignments, shifts, published timetable, holidays and attendance summary.");
console.log("No Prisma schema migration is required.");
