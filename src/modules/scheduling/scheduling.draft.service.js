import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";

const ALLOWED_STATUS = new Set(["WORK", "LEAVE", "REST", "OFF"]);

/**
 * Update a draft generation only. Published schedules can never be changed by
 * this endpoint; publish is the explicit operation that writes active shift
 * assignments. Every id is scoped to the specified company and generation.
 */
export async function updateGenerationAssignments(companyId, userId, generationId, assignments, meta = {}) {
  return prisma.$transaction(async (tx) => {
    const generation = await tx.scheduleGeneration.findFirst({
      where: { id: generationId, companyId },
      include: { policy: true, assignments: { select: { id: true, employeeId: true, status: true, shiftId: true } } },
    });
    if (!generation) throw new AppError("Schedule draft not found", 404);
    if (generation.status !== "DRAFT") throw new AppError("Only a draft schedule can be edited", 409);
    if (!Array.isArray(assignments) || assignments.length < 1) throw new AppError("At least one draft change is required", 400);

    const submittedIds = assignments.map((item) => item.id);
    if (new Set(submittedIds).size !== submittedIds.length) throw new AppError("The draft contains duplicate assignment changes", 400);
    const byId = new Map(generation.assignments.map((item) => [item.id, item]));
    if (assignments.some((item) => !byId.has(item.id))) throw new AppError("One or more assignments do not belong to this draft", 400);

    const shiftIds = [...new Set(assignments.filter((item) => item.status === "WORK" && item.shiftId).map((item) => item.shiftId))];
    if (shiftIds.length) {
      const count = await tx.shift.count({ where: { companyId, id: { in: shiftIds }, isActive: true } });
      if (count !== shiftIds.length) throw new AppError("One or more selected shifts are inactive or belong to another company", 400);
    }

    const normalized = [];
    for (const item of assignments) {
      if (!ALLOWED_STATUS.has(item.status)) throw new AppError(`Unsupported schedule status: ${item.status}`, 400);
      const shiftId = item.status === "WORK" ? (item.shiftId ?? null) : null;
      if (item.status === "WORK" && generation.policy.shiftEnabled && !shiftId) {
        throw new AppError("Choose a shift for every WORK assignment in a shift-enabled policy", 400);
      }
      normalized.push({
        id: item.id,
        status: item.status,
        shiftId,
        ...(item.reason !== undefined ? { reason: item.reason?.trim() || null } : {}),
      });
    }

    for (const item of normalized) {
      await tx.scheduleGenerationAssignment.update({
        where: { id: item.id },
        data: { status: item.status, shiftId: item.shiftId, ...(item.reason !== undefined ? { reason: item.reason } : {}) },
      });
    }

    await writeAudit(tx, {
      companyId,
      actorUserId: userId,
      action: "UPDATE",
      resource: "schedule_generation_draft",
      resourceId: generationId,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { changedAssignments: normalized.length },
    });

    return tx.scheduleGeneration.findUnique({
      where: { id: generationId },
      include: {
        policy: { include: { department: true } },
        assignments: {
          include: { employee: true, shift: true },
          orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
