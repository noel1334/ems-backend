import * as service from "./self-service.service.js";

const context = (req) => ({ userId: req.user.userId, companyId: req.user.companyId });

export const profile = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyProfile(context(req)) }); } catch (e) { next(e); } };
export const attendance = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyAttendance({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const schedule = async (req, res, next) => { try { res.json({ success: true, data: await service.getMySchedule({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const leave = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyLeave({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const payslips = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyPayslips({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };


export const checkInAttendance = async (req, res, next) => {
  try {
    const data = await service.checkInMyAttendance({
      ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent"),
    });
    res.status(200).json({ success: true, message: "Clock-in recorded", data });
  } catch (error) { next(error); }
};

export const checkOutAttendance = async (req, res, next) => {
  try {
    const data = await service.checkOutMyAttendance({
      ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent"),
    });
    res.status(200).json({ success: true, message: "Clock-out recorded", data });
  } catch (error) { next(error); }
};

export const startAttendanceBreak = async (req, res, next) => {
  try {
    const data = await service.startMyAttendanceBreak({ ...context(req), breakName: req.body?.breakName });
    res.status(200).json({ success: true, message: "Break started", data });
  } catch (error) { next(error); }
};

export const endAttendanceBreak = async (req, res, next) => {
  try {
    const data = await service.endMyAttendanceBreak(context(req));
    res.status(200).json({ success: true, message: "Break ended", data });
  } catch (error) { next(error); }
};

export const checkIn = async (req, res, next) => { try { res.status(200).json({ success: true, message: "You are checked in", data: await service.checkInForMe({ ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent") }) }); } catch (e) { next(e); } };
export const checkOut = async (req, res, next) => { try { res.status(200).json({ success: true, message: "You are checked out", data: await service.checkOutForMe({ ...context(req), ipAddress: req.ip, userAgent: req.get("user-agent") }) }); } catch (e) { next(e); } };
export const startBreak = async (req, res, next) => { try { res.status(200).json({ success: true, message: "Break started", data: await service.startMyBreak({ ...context(req), attendanceId: req.params.attendanceId, breakName: req.body?.breakName }) }); } catch (e) { next(e); } };
export const endBreak = async (req, res, next) => { try { res.status(200).json({ success: true, message: "Break ended", data: await service.endMyBreak({ ...context(req), attendanceId: req.params.attendanceId }) }); } catch (e) { next(e); } };
