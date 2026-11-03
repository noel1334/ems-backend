import asyncHandler from "../../common/utils/asyncHandler.js";
import { getAuditLog, listAuditLogs } from "./audit.service.js";

const csv = (value) => { const s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const rowsToCsv = (items) => {
  const headers = ["id","createdAt","action","module","resource","resourceId","user","email","description","ipAddress","requestId"];
  return [headers.join(","), ...items.map((r) => [r.id,r.createdAt?.toISOString?.() || r.createdAt,r.action,r.module,r.resource,r.resourceId,`${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim(),r.user?.email,r.description,r.ipAddress,r.requestId].map(csv).join(","))].join("\n");
};

export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await listAuditLogs({ companyId: req.user.companyId, query: req.query }) }));
export const get = asyncHandler(async (req, res) => res.json({ success: true, data: await getAuditLog({ companyId: req.user.companyId, id: req.params.id }) }));
export const exportCsv = asyncHandler(async (req, res) => {
  const data = await listAuditLogs({ companyId: req.user.companyId, query: { ...req.query, page: 1, limit: 100 } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0,10)}.csv"`);
  return res.send(rowsToCsv(data.items));
});
