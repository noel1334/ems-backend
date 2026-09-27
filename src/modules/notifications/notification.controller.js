import * as service from "./notification.service.js";

export const list = async (req, res, next) => { try { const data = await service.listNotifications({ companyId: req.user.companyId, userId: req.user.userId, ...req.query }); return res.json({ success: true, data }); } catch (e) { return next(e); } };
export const read = async (req, res, next) => { try { const data = await service.markRead({ companyId: req.user.companyId, userId: req.user.userId, id: req.params.id }); return res.json({ success: true, data }); } catch (e) { return next(e); } };
export const readAll = async (req, res, next) => { try { const data = await service.markAllRead({ companyId: req.user.companyId, userId: req.user.userId }); return res.json({ success: true, data }); } catch (e) { return next(e); } };
export const remove = async (req, res, next) => { try { const data = await service.deleteNotification({ companyId: req.user.companyId, userId: req.user.userId, id: req.params.id }); return res.json({ success: true, data }); } catch (e) { return next(e); } };
