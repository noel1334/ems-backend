import asyncHandler from "../../common/utils/asyncHandler.js";
import { getOverview,getAttendanceDashboard,getLeaveDashboard,getPayrollDashboard,getDeviceDashboard } from "./dashboard.service.js";
export const overview=asyncHandler(async(req,res)=>res.json({success:true,data:await getOverview({companyId:req.user.companyId,date:req.query.date})}));
export const attendance=asyncHandler(async(req,res)=>res.json({success:true,data:await getAttendanceDashboard({companyId:req.user.companyId,from:req.query.from,to:req.query.to,departmentId:req.query.departmentId})}));
export const leave=asyncHandler(async(req,res)=>res.json({success:true,data:await getLeaveDashboard({companyId:req.user.companyId})}));
export const payroll=asyncHandler(async(req,res)=>res.json({success:true,data:await getPayrollDashboard({companyId:req.user.companyId,year:req.query.year,month:req.query.month})}));
export const devices=asyncHandler(async(req,res)=>res.json({success:true,data:await getDeviceDashboard({companyId:req.user.companyId})}));
