import fs from 'node:fs/promises';

async function update(path, transform) {
  let text = await fs.readFile(path, 'utf8');
  const next = transform(text);
  if (next !== text) {
    await fs.writeFile(path, next, 'utf8');
    console.log(`Updated ${path}`);
  } else {
    console.log(`Already up to date: ${path}`);
  }
}

await update('src/modules/self-service/self-service.service.js', (source) => {
  let text = source;
  const appErrorImport = 'import AppError from "../../common/errors/AppError.js";';
  const attendanceImport = 'import { checkIn as recordCheckIn, checkOut as recordCheckOut, startBreak as recordBreakStart, endBreak as recordBreakEnd } from "../attendance/attendance.service.js";';
  if (!text.includes('recordCheckIn')) {
    if (!text.includes(appErrorImport)) throw new Error('Could not find AppError import in self-service.service.js');
    text = text.replace(appErrorImport, `${appErrorImport}\n${attendanceImport}`);
  }
  text = text.replace('const end = to ? new Date(to) : new Date(Date.now() + 30 * 86400000);', 'const end = to ? new Date(to) : new Date();');
  const oldInclude = 'include: { shift: { select: { id: true, name: true, code: true } } } }),';
  const newInclude = 'include: { shift: { select: { id: true, name: true, code: true } }, breaks: { orderBy: { breakStartAt: "desc" } } } }),';
  if (!text.includes('breaks: { orderBy: { breakStartAt: "desc" } }')) {
    text = text.replace(oldInclude, newInclude);
  }
  if (!text.includes('export const checkInForMe')) {
    text += `

// Employee clock actions resolve the linked employee from the authenticated user.
// The client never supplies an employeeId, preventing attendance spoofing across staff.
export const checkInForMe = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordCheckIn({ companyId, employeeId, occurredAt: new Date(), source: "WEB", ipAddress, userAgent });
};

export const checkOutForMe = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordCheckOut({ companyId, employeeId, occurredAt: new Date(), source: "WEB", ipAddress, userAgent });
};

const assertOwnAttendance = async ({ userId, companyId, attendanceId }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const attendance = await prisma.attendance.findFirst({
    where: { id: attendanceId, companyId, employeeId },
    select: { id: true },
  });
  if (!attendance) throw new AppError("Attendance record not found for your account", 404, "ATTENDANCE_NOT_FOUND");
  return attendance.id;
};

export const startMyBreak = async ({ userId, companyId, attendanceId, breakName }) => {
  const ownAttendanceId = await assertOwnAttendance({ userId, companyId, attendanceId });
  return recordBreakStart({ companyId, attendanceId: ownAttendanceId, breakName: String(breakName || "Break").slice(0, 100), occurredAt: new Date(), source: "WEB" });
};

export const endMyBreak = async ({ userId, companyId, attendanceId }) => {
  const ownAttendanceId = await assertOwnAttendance({ userId, companyId, attendanceId });
  return recordBreakEnd({ companyId, attendanceId: ownAttendanceId, occurredAt: new Date(), source: "WEB" });
};
`;
  }
  return text;
});

await update('src/modules/self-service/self-service.controller.js', (source) => {
  if (source.includes('export const checkIn =')) return source;
  return source + `
export const checkIn = async (req, res, next) => { try { res.status(200).json({ success: true, message: "You are checked in", data: await service.checkInForMe({ ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent") }) }); } catch (e) { next(e); } };
export const checkOut = async (req, res, next) => { try { res.status(200).json({ success: true, message: "You are checked out", data: await service.checkOutForMe({ ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent") }) }); } catch (e) { next(e); } };
export const startBreak = async (req, res, next) => { try { res.status(200).json({ success: true, message: "Break started", data: await service.startMyBreak({ ...context(req), attendanceId: req.params.attendanceId, breakName: req.body?.breakName }) }); } catch (e) { next(e); } };
export const endBreak = async (req, res, next) => { try { res.status(200).json({ success: true, message: "Break ended", data: await service.endMyBreak({ ...context(req), attendanceId: req.params.attendanceId }) }); } catch (e) { next(e); } };
`;
});

await update('src/modules/self-service/self-service.routes.js', (source) => {
  if (source.includes('router.post("/attendance/check-in"')) return source;
  const marker = 'router.get("/attendance", c.attendance);';
  if (!source.includes(marker)) throw new Error('Could not find /attendance route in self-service.routes.js');
  return source.replace(marker, `${marker}
// Employee self-service actions are scoped to the employee linked to req.user.
router.post("/attendance/check-in", c.checkIn);
router.post("/attendance/check-out", c.checkOut);
router.post("/attendance/:attendanceId/break/start", c.startBreak);
router.post("/attendance/:attendanceId/break/end", c.endBreak);`);
});

await update('src/modules/attendance/attendance.service.js', (source) => {
  if (source.includes('End the active break before checking out')) return source;
  const marker = `        if (attendance.checkOutAt) {
            throw new AppError(
                "Employee has already checked out",
                409,
            );
        }

        if (
            isBefore(
                occurredAt,
                new Date(attendance.checkInAt),
            )
        ) {`;
  const replacement = `        if (attendance.checkOutAt) {
            throw new AppError(
                "Employee has already checked out",
                409,
            );
        }

        const openBreak = await findOpenBreak(attendance.id, tx);
        if (openBreak) {
            throw new AppError(
                "End the active break before checking out",
                409,
            );
        }

        if (
            isBefore(
                occurredAt,
                new Date(attendance.checkInAt),
            )
        ) {`;
  if (!source.includes(marker)) throw new Error('Could not find checkout validation in attendance.service.js');
  return source.replace(marker, replacement);
});

console.log('Employee self-attendance backend patch applied. No schema migration is required.');
