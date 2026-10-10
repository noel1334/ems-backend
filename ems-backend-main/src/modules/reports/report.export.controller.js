import asyncHandler from "../../common/utils/asyncHandler.js";
import { buildReport } from "./report.service.js";

export const exportReport = asyncHandler(async (req,res) => {
  const result = await buildReport({companyId:req.user.companyId,type:req.params.type,query:req.query});
  const format = String(req.query.format || "xlsx").toLowerCase();
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(result.title.slice(0,31));
    const rows = result.rows;
    if (rows.length) { sheet.columns = Object.keys(rows[0]).map(k=>({header:k,key:k,width:Math.min(32,Math.max(12,k.length+2))})); sheet.addRows(rows); }
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="${result.name}.xlsx"`);
    return workbook.xlsx.write(res);
  }
  if (format === "pdf") {
    const PDFDocument = (await import("pdfkit")).default;
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${result.name}.pdf"`);
    const doc = new PDFDocument({margin:36,size:"A4",layout:"landscape"});
    doc.pipe(res); doc.fontSize(16).text(result.title); doc.moveDown(); doc.fontSize(8);
    const rows=result.rows;
    if (!rows.length) doc.text("No records found.");
    else {
      const keys=Object.keys(rows[0]); doc.text(keys.join(" | ")); doc.moveDown(0.5);
      for (const row of rows) { const line=keys.map(k=>String(row[k] ?? "").replace(/\s+/g," ")).join(" | "); doc.text(line,{width:750}); if(doc.y>540) {doc.addPage(); doc.fontSize(8);} }
    }
    doc.end(); return;
  }
  return res.status(400).json({success:false,message:"Supported export formats are xlsx and pdf"});
});
