import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";

const MAX_ROWS = 10000;
const parseDate = (value, end = false) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError("Invalid date", 400, "INVALID_DATE");
  if (end) d.setHours(23, 59, 59, 999); else d.setHours(0, 0, 0, 0);
  return d;
};
const range = (from, to) => {
  const start = parseDate(from) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = parseDate(to, true) || new Date();
  if (end < start) throw new AppError("Date range is invalid", 400, "INVALID_DATE_RANGE");
  return { start, end };
};
const money = (v) => v == null ? 0 : Number(v);

async function attendance(companyId, query) {
  const { start, end } = range(query.from, query.to);
  const rows = await prisma.attendance.findMany({
    where: { companyId, attendanceDate: { gte: start, lte: end }, ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}) },
    orderBy: [{ attendanceDate: "asc" }, { employee: { employeeNumber: "asc" } }], take: MAX_ROWS,
    include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } } }, shift: { select: { name: true } } }
  });
  return rows.map(r => ({ date: r.attendanceDate.toISOString().slice(0,10), employeeNumber:r.employee.employeeNumber, employee:`${r.employee.firstName} ${r.employee.lastName}`.trim(), department:r.employee.department?.name || "", shift:r.shift?.name || "", status:r.status, checkIn:r.checkInAt?.toISOString() || "", checkOut:r.checkOutAt?.toISOString() || "", workedMinutes:r.workedMinutes, lateMinutes:r.lateMinutes, earlyDepartureMinutes:r.earlyDepartureMinutes, overtimeMinutes:r.overtimeMinutes, breakMinutes:r.breakMinutes }));
}
async function leave(companyId, query) {
  const { start, end } = range(query.from, query.to);
  const rows = await prisma.leaveRequest.findMany({ where:{companyId,startDate:{lte:end},endDate:{gte:start}}, orderBy:{startDate:"asc"}, take:MAX_ROWS, include:{employee:{select:{employeeNumber:true,firstName:true,lastName:true,department:{select:{name:true}}}},leaveType:{select:{name:true,code:true}}} });
  return rows.map(r=>({employeeNumber:r.employee.employeeNumber,employee:`${r.employee.firstName} ${r.employee.lastName}`.trim(),department:r.employee.department?.name||"",leaveType:r.leaveType.name,leaveCode:r.leaveType.code,startDate:r.startDate.toISOString().slice(0,10),endDate:r.endDate.toISOString().slice(0,10),totalDays:money(r.totalDays),status:r.status,reason:r.reason||""}));
}
async function payroll(companyId, query) {
  const { start, end } = range(query.from, query.to);
  const rows = await prisma.payrollItem.findMany({ where:{companyId,period:{startDate:{lte:end},endDate:{gte:start}}}, orderBy:{employee:{employeeNumber:"asc"}}, take:MAX_ROWS, include:{employee:{select:{employeeNumber:true,firstName:true,lastName:true,department:{select:{name:true}}}},period:{select:{name:true,startDate:true,endDate:true}},lines:true} });
  return rows.map(r=>({period:r.period.name,periodStart:r.period.startDate.toISOString().slice(0,10),periodEnd:r.period.endDate.toISOString().slice(0,10),employeeNumber:r.employee.employeeNumber,employee:`${r.employee.firstName} ${r.employee.lastName}`.trim(),department:r.employee.department?.name||"",basicSalary:money(r.basicSalary),earnings:money(r.totalEarnings),deductions:money(r.totalDeductions),grossSalary:money(r.grossSalary),netSalary:money(r.netSalary),status:r.status}));
}
async function employees(companyId) {
  const rows = await prisma.employee.findMany({where:{companyId},orderBy:{employeeNumber:"asc"},take:MAX_ROWS,include:{department:{select:{name:true}},designation:{select:{name:true}}}});
  return rows.map(r=>({employeeNumber:r.employeeNumber,firstName:r.firstName,middleName:r.middleName||"",lastName:r.lastName,employeeName:`${r.firstName} ${r.lastName}`.trim(),email:r.email||"",phone:r.phone||"",department:r.department?.name||"",designation:r.designation?.name||"",jobTitle:r.jobTitle||"",employeeType:r.employeeType,employmentStatus:r.employmentStatus,hireDate:r.hireDate.toISOString().slice(0,10)}));
}
async function overtime(companyId, query) {
  const rows = await attendance(companyId, query);
  return rows.filter(r => r.overtimeMinutes > 0);
}

export async function buildReport({companyId,type,query={}}) {
  const normalized = String(type||"").toLowerCase();
  if (normalized === "attendance") return { name:"attendance-report", title:"Attendance Report", rows:await attendance(companyId,query) };
  if (normalized === "leave") return { name:"leave-report", title:"Leave Report", rows:await leave(companyId,query) };
  if (normalized === "payroll") return { name:"payroll-report", title:"Payroll Report", rows:await payroll(companyId,query) };
  if (normalized === "employees") return { name:"employee-report", title:"Employee Report", rows:await employees(companyId) };
  if (normalized === "overtime") return { name:"overtime-report", title:"Overtime Report", rows:await overtime(companyId,query) };
  throw new AppError("Unsupported report type",400,"UNSUPPORTED_REPORT");
}
