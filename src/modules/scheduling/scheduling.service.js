import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
const DAY=86400000, dateKey=d=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())), addDays=(d,n)=>new Date(d.getTime()+n*DAY), daysBetween=(a,b)=>Math.floor((dateKey(b)-dateKey(a))/DAY), asArray=v=>Array.isArray(v)?v:[], pct=(v,t)=>Math.floor(Number(v||0)*t/100), dateString=d=>dateKey(d).toISOString().slice(0,10);
const blocked=(d,p)=>asArray(p.blockedDates).map(String).includes(dateString(d));
const preferred=(d,p)=>{const a=asArray(p.preferredLeaveDays);return !a.length||a.includes(d.getUTCDay())||a.includes(String(d.getUTCDay()));};
const working=(d,p)=>{const a=asArray(p.workingDays);return !a.length||a.includes(d.getUTCDay())||a.includes(String(d.getUTCDay()));};
async function getPolicyRecord(companyId,id,tx=prisma){const p=await tx.schedulingPolicy.findFirst({where:{id,companyId},include:{department:true}});if(!p)throw new AppError("Scheduling policy not found",404);return p;}
async function validateDepartment(companyId,id,tx=prisma){if(!id)return;const d=await tx.department.findFirst({where:{id,companyId,isActive:true}});if(!d)throw new AppError("Department not found in this company",400);}
async function validateShifts(companyId,ids,tx=prisma){if(!ids?.length)return;const n=await tx.shift.count({where:{companyId,id:{in:ids},isActive:true}});if(n!==ids.length)throw new AppError("One or more shifts do not belong to this company",400);}
export async function createPolicy(companyId,input){await validateDepartment(companyId,input.departmentId);await validateShifts(companyId,input.shiftIds);return prisma.schedulingPolicy.create({data:{companyId,...input}});}
export async function listPolicies(companyId,q){const page=Math.max(1,Number.parseInt(q.page,10)||1),limit=Math.min(200,Math.max(1,Number.parseInt(q.limit,10)||20)),where={companyId,...(q.departmentId?{departmentId:q.departmentId}:{})};const [data,total]=await Promise.all([prisma.schedulingPolicy.findMany({where,orderBy:[{departmentId:"asc"},{name:"asc"}],skip:(page-1)*limit,take:limit,include:{department:true}}),prisma.schedulingPolicy.count({where})]);return{data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};}
export const getPolicy=async(companyId,id)=>getPolicyRecord(companyId,id);
export async function updatePolicy(companyId,id,input){await getPolicyRecord(companyId,id);if(input.departmentId!==undefined)await validateDepartment(companyId,input.departmentId);await validateShifts(companyId,input.shiftIds);return prisma.schedulingPolicy.update({where:{id},data:input,include:{department:true}});}
export async function generate(companyId, userId, input, meta = {}) {
  const policy = await getPolicyRecord(companyId, input.policyId);
  if (!policy.isActive) throw new AppError("Scheduling policy is inactive", 409);
  if (!policy.departmentId) throw new AppError("A generation policy must target a department", 400);

  const start = dateKey(input.startDate);
  const end = dateKey(input.endDate);
  if (end < start) throw new AppError("Schedule end date must be on or after its start date", 400);
  const calendarDays = daysBetween(start, end) + 1;
  if (calendarDays > 366) throw new AppError("A schedule generation cannot exceed 366 calendar days", 400);

  return prisma.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: { companyId, departmentId: policy.departmentId, employmentStatus: "ACTIVE" },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
    });
    if (!employees.length) throw new AppError("No active employees found in the selected department", 409);
    const assignmentCount = employees.length * calendarDays;
    if (assignmentCount > 50000) throw new AppError("This schedule would create more than 50,000 employee-day records. Reduce the date range or split the schedule into smaller periods.", 413);

    let shifts = [];
    if (policy.shiftEnabled) {
      const selectedShiftIds = asArray(policy.shiftIds).map(String);
      if (!selectedShiftIds.length) throw new AppError("Shift scheduling is enabled but no shifts are selected in the saved policy", 409);
      shifts = await tx.shift.findMany({
        where: { companyId, isActive: true, id: { in: selectedShiftIds } },
        orderBy: { code: "asc" },
      });
      if (shifts.length !== new Set(selectedShiftIds).size) throw new AppError("One or more selected shifts are inactive or belong to another company", 409);
      if (!shifts.length) throw new AppError("Shift scheduling is enabled but no selected active shifts are available", 409);
    }

    const holidays = await tx.holiday.findMany({
      where: { companyId, isActive: true, OR: [{ date: { gte: start, lte: end } }, { isRecurring: true }] },
      orderBy: { date: "asc" },
    });
    const holidayMode = policy.holidayWorkingMode || "RESPECT_PUBLIC_AND_COMPANY";
    const holidayIsObserved = (holiday) => {
      if (holidayMode === "WORK_AS_NORMAL") return false;
      if (holidayMode === "RESPECT_ALL") return true;
      return ["PUBLIC", "COMPANY"].includes(holiday.holidayType);
    };
    const holidayForDate = (date) => {
      const key = dateString(date);
      const monthDay = key.slice(5);
      return holidays.find((holiday) => {
        if (!holidayIsObserved(holiday)) return false;
        const holidayKey = dateString(holiday.date);
        return holiday.isRecurring ? holidayKey.slice(5) === monthDay : holidayKey === key;
      });
    };

    const employeeIds = employees.map((employee) => employee.id);
    const approvedLeaves = await tx.leaveRequest.findMany({
      where: { companyId, employeeId: { in: employeeIds }, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    });
    const leavesByEmployee = new Map();
    for (const leave of approvedLeaves) {
      if (!leavesByEmployee.has(leave.employeeId)) leavesByEmployee.set(leave.employeeId, []);
      leavesByEmployee.get(leave.employeeId).push(leave);
    }
    const approvedLeaveForDate = (employeeId, date) => {
      const key = dateString(date);
      return (leavesByEmployee.get(employeeId) || []).find((leave) => dateString(leave.startDate) <= key && dateString(leave.endDate) >= key);
    };

    const total = employees.length;
    const maxByLeavePercent = policy.maxLeavePercent == null ? total : Math.floor(Number(policy.maxLeavePercent) * total / 100);
    const maxByMinimumStaffPercent = policy.minStaffingPercent == null ? total : Math.max(0, total - Math.ceil(Number(policy.minStaffingPercent) * total / 100));
    const maxByMinimumStaffCount = policy.minStaffingCount == null ? total : Math.max(0, total - Number(policy.minStaffingCount));
    const maxLeave = Math.max(0, Math.min(maxByLeavePercent, maxByMinimumStaffPercent, maxByMinimumStaffCount));
    const leaveEnabled = policy.leaveSchedulingMode !== "MANUAL" && policy.leaveDurationDays > 0 && maxLeave > 0;
    const groupSize = Math.max(1, maxLeave);
    const groups = Math.ceil(total / groupSize);
    const leaveRanges = new Map();
    if (leaveEnabled) {
      let cursor = addDays(start, policy.leaveCycleAfterDays ?? 0);
      for (let group = 0; group < groups; group++) {
        let blockStart = cursor;
        let guard = 0;
        while (blockStart <= end && guard++ < 370 && (blocked(blockStart, policy) || !preferred(blockStart, policy))) blockStart = addDays(blockStart, 1);
        if (blockStart <= end) {
          const blockEnd = addDays(blockStart, policy.leaveDurationDays - 1);
          const members = employees.filter((_, index) => index % groups === group);
          for (const employee of members) leaveRanges.set(employee.id, { start: blockStart, end: blockEnd, group });
          cursor = addDays(blockEnd, 1);
        }
      }
    }

    const isNightShift = (shift) => {
      const startTime = String(shift.startTime || "").slice(0, 5);
      return Boolean(shift.isOvernight) || startTime >= "18:00" || (!!startTime && startTime < "06:00");
    };
    const lastWorkShift = new Map();
    const rows = [];
    let holidaySlots = 0;
    let approvedLeaveSlots = 0;
    let automaticLeaveSlots = 0;
    let nightAdjustments = 0;

    // Persist a row for every active employee on every calendar day so the reviewer can
    // distinguish work, leave, rest and holiday days rather than guessing from missing rows.
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const scheduledWorkingDay = working(date, policy);
      const cycle = policy.rotationEnabled && policy.rotationDays ? Math.floor(daysBetween(start, date) / policy.rotationDays) : 0;
      const holiday = holidayForDate(date);
      for (let index = 0; index < employees.length; index++) {
        const employee = employees[index];
        let status = "REST";
        let shiftId = null;
        let reason = "Scheduled rest day";
        let leaveGroup = null;
        if (holiday) {
          status = "OFF";
          reason = `Holiday: ${holiday.name}`;
          holidaySlots++;
        } else if (!scheduledWorkingDay) {
          status = "REST";
          reason = "Scheduled rest day";
        } else {
          const approvedLeave = approvedLeaveForDate(employee.id, date);
          const automaticRange = leaveRanges.get(employee.id);
          const onAutomaticLeave = automaticRange && date >= automaticRange.start && date <= automaticRange.end;
          if (approvedLeave) {
            status = "LEAVE";
            reason = `Approved leave: ${approvedLeave.leaveType?.name || approvedLeave.leaveType?.code || "approved leave"}`;
            approvedLeaveSlots++;
          } else if (onAutomaticLeave) {
            status = "LEAVE";
            reason = "Automatic staggered leave allocation";
            leaveGroup = automaticRange.group;
            automaticLeaveSlots++;
          } else {
            status = "WORK";
            reason = null;
            if (policy.shiftEnabled) {
              const baseShift = shifts[(index + cycle) % shifts.length];
              let chosenShift = baseShift;
              const previous = lastWorkShift.get(employee.id);
              if (policy.preventConsecutiveNightShifts && previous && daysBetween(previous.date, date) === 1 && previous.isNight && isNightShift(baseShift)) {
                const alternative = shifts.find((candidate) => !isNightShift(candidate));
                if (alternative) {
                  chosenShift = alternative;
                  nightAdjustments++;
                  reason = "Shift adjusted to avoid consecutive night shifts";
                }
              }
              shiftId = chosenShift.id;
              lastWorkShift.set(employee.id, { date, isNight: isNightShift(chosenShift) });
            }
          }
        }
        rows.push({ companyId, employeeId: employee.id, departmentId: employee.departmentId, workDate: date, status, shiftId, shiftCycle: cycle, leaveGroup, reason });
      }
    }

    const notes = [
      `Generated ${calendarDays} calendar days for ${employees.length} active employees (${rows.length} employee-day records).`,
      `${holidaySlots} holiday OFF slots; ${approvedLeaveSlots} approved-leave slots; ${automaticLeaveSlots} automatically staggered leave slots.`,
      nightAdjustments ? `${nightAdjustments} assignments adjusted to reduce consecutive night shifts.` : null,
      holidayMode === "WORK_AS_NORMAL" ? "Holiday policy treats all listed holidays as normal workdays." : null,
    ].filter(Boolean).join("\n");
    const policySnapshot = {
      name: policy.name,
      departmentId: policy.departmentId,
      mode: policy.mode,
      shiftEnabled: policy.shiftEnabled,
      rotationEnabled: policy.rotationEnabled,
      rotationDays: policy.rotationDays,
      leaveSchedulingMode: policy.leaveSchedulingMode,
      leaveDurationDays: policy.leaveDurationDays,
      leaveCycleAfterDays: policy.leaveCycleAfterDays,
      maxLeavePercent: policy.maxLeavePercent == null ? null : Number(policy.maxLeavePercent),
      minStaffingPercent: policy.minStaffingPercent == null ? null : Number(policy.minStaffingPercent),
      minStaffingCount: policy.minStaffingCount,
      preferredLeaveDays: asArray(policy.preferredLeaveDays),
      blockedDates: asArray(policy.blockedDates),
      preferredLeaveDates: asArray(policy.preferredLeaveDates),
      shiftIds: asArray(policy.shiftIds).map(String),
      workingDays: asArray(policy.workingDays),
      autoApproveLeave: policy.autoApproveLeave,
      preventConsecutiveNightShifts: policy.preventConsecutiveNightShifts,
      holidayWorkingMode: holidayMode,
    };
    const generation = await tx.scheduleGeneration.create({
      data: { companyId, policyId: policy.id, startDate: start, endDate: end, generatedById: userId, status: "DRAFT", notes, policySnapshot },
    });
    await tx.scheduleGenerationAssignment.createMany({ data: rows.map((row) => ({ ...row, generationId: generation.id })) });
    await writeAudit(tx, {
      companyId, actorUserId: userId, action: "CREATE", resource: "schedule_generation", resourceId: generation.id,
      requestId: meta.requestId, ipAddress: meta.ipAddress, userAgent: meta.userAgent,
      metadata: { policyId: policy.id, employees: employees.length, calendarDays, assignments: rows.length, holidaySlots, approvedLeaveSlots, automaticLeaveSlots, nightAdjustments },
    });
    return tx.scheduleGeneration.findUnique({
      where: { id: generation.id },
      include: { policy: { include: { department: true } }, assignments: { include: { employee: true, shift: true }, orderBy: [{ workDate: "asc" }, { employeeId: "asc" }] } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function listGenerations(companyId,q){const page=Math.max(1,Number.parseInt(q.page,10)||1),limit=Math.min(200,Math.max(1,Number.parseInt(q.limit,10)||20)),where={companyId,...(q.status?{status:q.status}:{}),...(q.policyId?{policyId:q.policyId}:{})};const[data,total]=await Promise.all([prisma.scheduleGeneration.findMany({where,orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit,include:{policy:{include:{department:true}},_count:{select:{assignments:true}}}}),prisma.scheduleGeneration.count({where})]);return{data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};}
export async function getGeneration(companyId,id){const r=await prisma.scheduleGeneration.findFirst({where:{companyId,id},include:{policy:{include:{department:true}},assignments:{include:{employee:true,shift:true},orderBy:[{workDate:"asc"},{employeeId:"asc"}]}}});if(!r)throw new AppError("Schedule generation not found",404);return r;}

function parsePublishedScheduleRange(query = {}, maximumDays = 366) {
  const parseDate = (value, label) => {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(`${label} must use YYYY-MM-DD format`, 400);
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || dateString(parsed) !== text) throw new AppError(`${label} is not a valid calendar date`, 400);
    return dateKey(parsed);
  };
  const start = parseDate(query.startDate, "Start date") || dateKey(new Date());
  const end = parseDate(query.endDate, "End date") || addDays(start, 30);
  const days = daysBetween(start, end) + 1;
  if (days < 1) throw new AppError("End date must be on or after start date", 400);
  if (days > maximumDays) throw new AppError(`Choose a schedule range of ${maximumDays} days or less`, 400);
  return { start, end, startText: dateString(start), endText: dateString(end) };
}

async function publishedAssignmentRows(companyId, range, { departmentId, employeeId } = {}) {
  const where = {
    companyId,
    workDate: { gte: range.start, lte: range.end },
    ...(employeeId ? { employeeId } : {}),
    generation: {
      is: {
        companyId,
        status: "PUBLISHED",
        ...(departmentId ? { policy: { is: { departmentId } } } : {}),
      },
    },
  };
  // A department can have overlapping historic generations. Read a bounded set,
  // then keep the most recently published assignment for each employee/date.
  const records = await prisma.scheduleGenerationAssignment.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, departmentId: true } },
      shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, isOvernight: true } },
      generation: {
        select: {
          id: true,
          status: true,
          publishedAt: true,
          startDate: true,
          endDate: true,
          policy: { select: { id: true, name: true, departmentId: true, department: { select: { id: true, name: true, code: true } } } },
        },
      },
    },
    orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
    take: 50001,
  });
  records.sort((a, b) => {
    const byDate = dateString(a.workDate).localeCompare(dateString(b.workDate));
    if (byDate) return byDate;
    const byEmployee = String(a.employeeId).localeCompare(String(b.employeeId));
    if (byEmployee) return byEmployee;
    return new Date(b.generation?.publishedAt || 0).getTime() - new Date(a.generation?.publishedAt || 0).getTime();
  });
  const unique = new Map();
  for (const record of records.slice(0, 50000)) {
    const key = `${record.employeeId}:${dateString(record.workDate)}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  const items = [...unique.values()].sort((a, b) =>
    dateString(a.workDate).localeCompare(dateString(b.workDate)) ||
    String(a.employee?.lastName || "").localeCompare(String(b.employee?.lastName || "")) ||
    String(a.employee?.firstName || "").localeCompare(String(b.employee?.firstName || "")),
  );
  return {
    items,
    truncated: records.length > 50000,
    generationCount: new Set(items.map((row) => row.generation?.id).filter(Boolean)).size,
  };
}

export async function getPublishedDepartmentTimetable(companyId, query = {}) {
  const departmentId = String(query.departmentId || "").trim();
  if (!departmentId) throw new AppError("Choose a department to view its published timetable", 400);
  const range = parsePublishedScheduleRange(query, 62);
  const department = await prisma.department.findFirst({
    where: { id: departmentId, companyId },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!department) throw new AppError("Department not found in this company", 404);
  const result = await publishedAssignmentRows(companyId, range, { departmentId });
  return { department, startDate: range.startText, endDate: range.endText, ...result };
}

export async function getMyPublishedSchedule(companyId, userId, employeeId, query = {}) {
  if (!companyId || !userId || !employeeId) throw new AppError("This account is not linked to an employee record", 403);
  const range = parsePublishedScheduleRange(query, 366);
  // Revalidate the signed-in user's link so a stale token cannot read another
  // employee record after an administrator changes the account association.
  const link = await prisma.user.findFirst({
    where: { id: userId, companyId, employeeId, status: "ACTIVE" },
    select: { employeeId: true },
  });
  if (!link) throw new AppError("This account is not linked to an active employee record in this company", 403);
  const result = await publishedAssignmentRows(companyId, range, { employeeId });
  return { startDate: range.startText, endDate: range.endText, ...result };
}
export async function approve(companyId,userId,id,meta={}){const g=await getGeneration(companyId,id);if(g.status!=="DRAFT")throw new AppError("Only draft generations can be approved",409);return prisma.$transaction(async tx=>{const u=await tx.scheduleGeneration.update({where:{id},data:{status:"APPROVED",approvedById:userId}});await writeAudit(tx,{companyId,actorUserId:userId,action:"APPROVE",resource:"schedule_generation",resourceId:id,requestId:meta.requestId,metadata:{status:"APPROVED"}});return u;});}
export async function publish(companyId, userId, id, meta = {}) {
  const generation = await getGeneration(companyId, id);
  if (generation.status !== "APPROVED") throw new AppError("Approve the schedule before publishing it", 409);
  const schedulePolicy = generation.policySnapshot && typeof generation.policySnapshot === "object"
    ? { ...generation.policy, ...generation.policySnapshot }
    : generation.policy;
  if (schedulePolicy?.shiftEnabled) {
    const scheduledShiftIds = [...new Set(generation.assignments.filter((row) => row.status === "WORK" && row.shiftId).map((row) => row.shiftId))];
    if (generation.assignments.some((row) => row.status === "WORK" && !row.shiftId)) throw new AppError("Every WORK assignment in this shift schedule must have a shift", 409);
    const policyShiftIds = Array.isArray(schedulePolicy.shiftIds) ? schedulePolicy.shiftIds.map(String) : [];
    if (scheduledShiftIds.some((shiftId) => !policyShiftIds.includes(String(shiftId)))) throw new AppError("One or more shifts used in this draft are not part of the saved policy. Review and regenerate the draft.", 409);
    const activeShiftCount = scheduledShiftIds.length ? await prisma.shift.count({ where: { companyId, isActive: true, id: { in: scheduledShiftIds } } }) : 0;
    if (activeShiftCount !== scheduledShiftIds.length) throw new AppError("One or more shifts used in this draft are no longer active. Reactivate them or generate a new draft.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const employeeIds = [...new Set(generation.assignments.map((row) => row.employeeId))];
    const start = dateKey(generation.startDate);
    const end = dateKey(generation.endDate);
    const previousDay = addDays(start, -1);
    const resumeDay = addDays(end, 1);
    let preservedContinuations = 0;
    let shiftAssignmentsCreated = 0;

    // Only a shift-enabled policy rewrites shift assignment intervals. Office/day-plan
    // policies must never deactivate an employee's existing shift records.
    if (schedulePolicy?.shiftEnabled && employeeIds.length) {
      const overlapping = await tx.employeeShiftAssignment.findMany({
        where: {
          companyId,
          employeeId: { in: employeeIds },
          isActive: true,
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
      });

      // Preserve the before/after portions of any existing interval around the
      // published range rather than leaving invalid intervals or deleting future cover.
      for (const assignment of overlapping) {
        const from = dateKey(assignment.effectiveFrom);
        const to = assignment.effectiveTo ? dateKey(assignment.effectiveTo) : null;
        const startsBeforeRange = from < start;
        const continuesAfterRange = !to || to > end;

        if (startsBeforeRange && continuesAfterRange) {
          await tx.employeeShiftAssignment.update({
            where: { id: assignment.id },
            data: { effectiveTo: previousDay },
          });
          await tx.employeeShiftAssignment.create({
            data: {
              companyId,
              employeeId: assignment.employeeId,
              shiftId: assignment.shiftId,
              effectiveFrom: resumeDay,
              effectiveTo: assignment.effectiveTo,
              isPrimary: assignment.isPrimary,
              isActive: assignment.isActive,
            },
          });
          preservedContinuations++;
        } else if (startsBeforeRange) {
          await tx.employeeShiftAssignment.update({
            where: { id: assignment.id },
            data: { effectiveTo: previousDay },
          });
        } else if (continuesAfterRange) {
          await tx.employeeShiftAssignment.update({
            where: { id: assignment.id },
            data: { effectiveFrom: resumeDay },
          });
        } else {
          // Fully replaced by this published period; retain history but deactivate it.
          await tx.employeeShiftAssignment.update({
            where: { id: assignment.id },
            data: { isActive: false },
          });
        }
      }

      const byEmployee = new Map();
      for (const row of generation.assignments.filter((item) => item.status === "WORK" && item.shiftId)) {
        if (!byEmployee.has(row.employeeId)) byEmployee.set(row.employeeId, []);
        byEmployee.get(row.employeeId).push(row);
      }

      for (const [employeeId, rows] of byEmployee) {
        rows.sort((a, b) => a.workDate - b.workDate);
        let current = null;
        for (const row of rows) {
          if (!current || current.shiftId !== row.shiftId || daysBetween(current.to, row.workDate) !== 1) {
            if (current) {
              await tx.employeeShiftAssignment.create({
                data: { companyId, employeeId, shiftId: current.shiftId, effectiveFrom: current.from, effectiveTo: current.to, isPrimary: true, isActive: true },
              });
              shiftAssignmentsCreated++;
            }
            current = { shiftId: row.shiftId, from: row.workDate, to: row.workDate };
          } else {
            current.to = row.workDate;
          }
        }
        if (current) {
          await tx.employeeShiftAssignment.create({
            data: { companyId, employeeId, shiftId: current.shiftId, effectiveFrom: current.from, effectiveTo: current.to, isPrimary: true, isActive: true },
          });
          shiftAssignmentsCreated++;
        }
      }
    }

    const updated = await tx.scheduleGeneration.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await writeAudit(tx, {
      companyId,
      actorUserId: userId,
      action: "UPDATE",
      resource: "schedule_generation",
      resourceId: id,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: {
        status: "PUBLISHED",
        shiftAssignmentsCreated,
        preservedContinuations,
        plannedLeaveDays: generation.assignments.filter((row) => row.status === "LEAVE").length,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
