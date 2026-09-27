import * as service from "./self-service.service.js";

const context = (req) => ({ userId: req.user.userId, companyId: req.user.companyId });

export const profile = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyProfile(context(req)) }); } catch (e) { next(e); } };
export const attendance = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyAttendance({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const schedule = async (req, res, next) => { try { res.json({ success: true, data: await service.getMySchedule({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const leave = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyLeave({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
export const payslips = async (req, res, next) => { try { res.json({ success: true, data: await service.getMyPayslips({ ...context(req), ...req.query }) }); } catch (e) { next(e); } };
