import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";

const startOfDay = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) throw new AppError("Invalid date", 400, "INVALID_DATE");
  d.setHours(0, 0, 0, 0); return d;
};
const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const monthRange = (year, month) => {
  const now = new Date(); const y = Number(year) || now.getFullYear(); const m = (Number(month) || (now.getMonth()+1))-1;
  return { start: new Date(y,m,1), end: new Date(y,m+1,0,23,59,59,999), year:y, month:m+1 };
};

export const getOverview = async ({ companyId, date }) => {
  const day = startOfDay(date), end = endOfDay(day);
  const [employees, departments, today, pendingLeave, payroll, devices, openAttendance, drafts] = await prisma.$transaction([
    prisma.employee.count({ where: { companyId, employmentStatus: "ACTIVE" } }),
    prisma.department.count({ where: { companyId } }),
    prisma.attendance.groupBy({ by:["status"], where:{companyId,attendanceDate:{gte:day,lte:end}}, _count:{_all:true} }),
    prisma.leaveRequest.count({ where:{companyId,status:"PENDING"} }),
    prisma.payrollPeriod.count({ where:{companyId,status:{in:["DRAFT","CALCULATED","APPROVED"]}} }),
    prisma.attendanceDevice.count({ where:{companyId,isActive:true} }),
    prisma.attendance.count({ where:{companyId,attendanceDate:{gte:day,lte:end},checkInAt:{not:null},checkOutAt:null,isLocked:false} }),
    prisma.scheduleGeneration.count({ where:{companyId,status:"DRAFT"} }),
  ]);
  return { date:day.toISOString().slice(0,10), employees:{active:employees}, departments,
    attendance:{...Object.fromEntries(today.map(x=>[x.status,x._count._all])),open:openAttendance,total:today.reduce((n,x)=>n+x._count._all,0)},
    leave:{pendingRequests:pendingLeave}, payroll:{actionablePeriods:payroll}, biometricDevices:{active:devices}, scheduling:{draftGenerations:drafts} };
};

export const getAttendanceDashboard = async ({companyId,from,to,departmentId}) => {
  const start=startOfDay(from), end=endOfDay(to ? new Date(to) : start);
  if (end<start) throw new AppError("Date range is invalid",400,"INVALID_DATE_RANGE");
  const where={companyId,attendanceDate:{gte:start,lte:end},...(departmentId?{employee:{departmentId}}:{})};
  const [byStatus,late,overtime,open,total]=await prisma.$transaction([
    prisma.attendance.groupBy({by:["status"],where,_count:{_all:true}}),
    prisma.attendance.count({where:{...where,lateMinutes:{gt:0}}}),
    prisma.attendance.count({where:{...where,overtimeMinutes:{gt:0}}}),
    prisma.attendance.count({where:{...where,checkInAt:{not:null},checkOutAt:null,isLocked:false}}),
    prisma.attendance.count({where}),
  ]);
  return {from:start.toISOString(),to:end.toISOString(),departmentId:departmentId??null,byStatus:Object.fromEntries(byStatus.map(x=>[x.status,x._count._all])),late,overtime,open,total};
};

export const getLeaveDashboard = async ({companyId}) => {
  const now=new Date();
  const [byStatus,upcoming,onLeaveToday]=await prisma.$transaction([
    prisma.leaveRequest.groupBy({by:["status"],where:{companyId},_count:{_all:true}}),
    prisma.leaveRequest.findMany({where:{companyId,status:"APPROVED",startDate:{gte:now}},orderBy:{startDate:"asc"},take:10,include:{employee:{select:{id:true,employeeNumber:true,firstName:true,lastName:true}},leaveType:{select:{id:true,name:true,code:true}}}}),
    prisma.leaveRequest.count({where:{companyId,status:"APPROVED",startDate:{lte:now},endDate:{gte:now}}}),
  ]);
  return {byStatus:Object.fromEntries(byStatus.map(x=>[x.status,x._count._all])),onLeaveToday,upcoming};
};

export const getPayrollDashboard = async ({companyId,year,month}) => {
  const {start,end,...period}=monthRange(year,month);
  const [periods,items,salaries]=await prisma.$transaction([
    prisma.payrollPeriod.findMany({where:{companyId,startDate:{lte:end},endDate:{gte:start}},orderBy:{startDate:"desc"},take:10}),
    prisma.payrollItem.count({where:{companyId,period:{startDate:{lte:end},endDate:{gte:start}}}}),
    prisma.employeeSalary.count({where:{companyId,status:"ACTIVE",effectiveFrom:{lte:end},OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]}}),
  ]);
  return {...period,periods,payrollItems:items,activeSalaries:salaries};
};

export const getDeviceDashboard = async ({companyId}) => {
  const devices=await prisma.attendanceDevice.findMany({where:{companyId},orderBy:{name:"asc"},include:{credentials:{select:{id:true,name:true,isActive:true,lastUsedAt:true}}}});
  const now=Date.now();
  return devices.map(d=>{const active=d.credentials.filter(c=>c.isActive&&c.lastUsedAt); const latest=active.reduce((a,c)=>!a||c.lastUsedAt>a?c.lastUsedAt:a,null); return {id:d.id,name:d.name,deviceId:d.deviceId,deviceType:d.deviceType,isActive:d.isActive,lastHeartbeatAt:latest,online:Boolean(latest&&now-latest.getTime()<=5*60*1000)};});
};
