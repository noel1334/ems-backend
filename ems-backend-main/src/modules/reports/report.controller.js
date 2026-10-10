import asyncHandler from "../../common/utils/asyncHandler.js";
import { buildReport } from "./report.service.js";

const escapeCsv = (value) => { const s = value == null ? "" : String(value); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const toCsv = rows => { if (!rows.length) return ""; const keys = Object.keys(rows[0]); return [keys.join(","), ...rows.map(r=>keys.map(k=>escapeCsv(r[k])).join(","))].join("\n"); };

export const report = asyncHandler(async (req,res) => {
  const result = await buildReport({companyId:req.user.companyId,type:req.params.type,query:req.query});
  const format = String(req.query.format || "json").toLowerCase();
  if (format === "json") return res.json({success:true,data:result});
  if (format === "csv") {
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="${result.name}.csv"`);
    return res.send(toCsv(result.rows));
  }
  return res.status(400).json({success:false,message:"Supported formats are json and csv. Use /reports/export/:type for Excel/PDF."});
});
