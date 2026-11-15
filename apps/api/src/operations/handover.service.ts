import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FollowStatus, type UserRole } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

export function nextOperationalDate(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

const shiftWithAccess = { assignmentSnapshots: true, operationalDay: true } as const;

function containsSerializationConflict(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === "40001" || value === "TransactionWriteConflict") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>).some((item) => containsSerializationConflict(item, seen));
}

function isRetryableSerializationError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || (error.code === "P2010" && containsSerializationConflict(error.meta)));
}

@Injectable()
export class HandoverService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handover(shiftInstanceId: string, userId: string, role: UserRole) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.handoverTransaction(tx, shiftInstanceId, userId, role),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableSerializationError(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException("Handover could not be serialized");
  }

  private async handoverTransaction(tx: Prisma.TransactionClient, shiftInstanceId: string, userId: string, role: UserRole) {
    await tx.$queryRaw`SELECT id FROM "ShiftInstance" WHERE id = ${shiftInstanceId}::uuid FOR UPDATE`;
    const current = await tx.shiftInstance.findUnique({ where: { id: shiftInstanceId }, include: shiftWithAccess });
    if (!current) throw new NotFoundException("Shift instance not found");
    if (role !== "ADMIN" && !current.assignmentSnapshots.some((assignment) => assignment.userId === userId)) {
      throw new ForbiddenException("You are not assigned to this shift");
    }
    const next = await this.resolveSuccessor(tx, current);
    await tx.$queryRaw`SELECT id FROM "ShiftInstance" WHERE id = ${next.id}::uuid FOR UPDATE`;

    if (current.status === "CLOSED") {
      const transferredFollowCount = await tx.followTransfer.count({ where: { fromShiftInstanceId: current.id, toShiftInstanceId: next.id } });
      return { closedShiftId: current.id, openedShiftId: next.id, transferredFollowCount, alreadyCompleted: true };
    }
    if (current.status !== "ACTIVE") throw new ConflictException("Only the active shift can be handed over");
    if (next.status !== "UPCOMING") throw new ConflictException("The next shift is not available");

    const now = new Date();
    await tx.shiftInstance.update({
      where: { id: current.id },
      data: { status: "CLOSED", closedAt: now, version: { increment: 1 } },
    });
    await tx.shiftInstance.update({
      where: { id: next.id },
      data: { status: "ACTIVE", openedAt: now, closedAt: null, version: { increment: 1 } },
    });
    const ownOpenFollows = await tx.entry.findMany({
      where: { shiftInstanceId: current.id, type: "FOLLOW", followStatus: "OPEN" },
      select: { id: true },
    });
    const incomingOpenFollows = await tx.followTransfer.findMany({
      where: { toShiftInstanceId: current.id, status: "OPEN", sourceEntry: { followStatus: "OPEN" } },
      select: { sourceEntryId: true },
    });
    const openFollowIds = [...new Set([
      ...ownOpenFollows.map((entry) => entry.id),
      ...incomingOpenFollows.map((transfer) => transfer.sourceEntryId),
    ])];
    if (openFollowIds.length) {
      await tx.followTransfer.createMany({
        data: openFollowIds.map((sourceEntryId) => ({ sourceEntryId, fromShiftInstanceId: current.id, toShiftInstanceId: next.id })),
        skipDuplicates: true,
      });
    }
    await tx.auditEvent.create({
      data: {
        actorUserId: userId, action: "SHIFT_HANDOVER", entityType: "ShiftInstance", entityId: current.id,
        before: { status: "ACTIVE" }, after: { status: "CLOSED", openedShiftId: next.id, transferredFollowCount: openFollowIds.length },
      },
    });
    return { closedShiftId: current.id, openedShiftId: next.id, transferredFollowCount: openFollowIds.length, alreadyCompleted: false };
  }

  private async resolveSuccessor(tx: Prisma.TransactionClient, current: { id: string; operationalDayId: string; positionSnapshot: number; operationalDay: { operationalDate: Date } }) {
    const sameDay = await tx.shiftInstance.findFirst({
      where: { operationalDayId: current.operationalDayId, positionSnapshot: { gt: current.positionSnapshot } },
      orderBy: { positionSnapshot: "asc" },
    });
    if (sameDay) return sameDay;
    const operationalDate = nextOperationalDate(current.operationalDay.operationalDate);
    let day = await tx.operationalDay.findUnique({
      where: { operationalDate }, include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
    });
    if (!day) {
      const definitions = await tx.shiftDefinition.findMany({
        where: { active: true }, orderBy: { position: "asc" }, include: { assignments: true },
      });
      if (!definitions.length) throw new ConflictException("No active shift schedule is available");
      day = await tx.operationalDay.create({
        data: {
          operationalDate, boundaryMinute: definitions[0]!.startMinute,
          shiftInstances: { create: definitions.map((definition) => ({
            definitionId: definition.id, nameSnapshot: definition.name,
            startMinuteSnapshot: definition.startMinute, endMinuteSnapshot: definition.endMinute,
            positionSnapshot: definition.position, status: "UPCOMING",
            assignmentSnapshots: { create: definition.assignments.map((assignment) => ({ userId: assignment.userId })) },
          })) },
        },
        include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
      });
    }
    const successor = day.shiftInstances[0];
    if (!successor) throw new ConflictException("The next operational day has no shifts");
    return successor;
  }

  async updateFollowStatus(transferId: string, userId: string, role: UserRole, status: FollowStatus) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.followTransfer.findUnique({
        where: { id: transferId },
        include: { toShiftInstance: { include: { assignmentSnapshots: true } }, sourceEntry: true },
      });
      if (!transfer) throw new NotFoundException("Follow transfer not found");
      const assigned = transfer.toShiftInstance.assignmentSnapshots.some((assignment) => assignment.userId === userId);
      if (transfer.toShiftInstance.status !== "ACTIVE" || (role !== "ADMIN" && !assigned)) {
        throw new ForbiddenException("This Follow is read-only");
      }
      const completed = status === "COMPLETED";
      const updated = await tx.followTransfer.update({
        where: { id: transferId },
        data: { status, completedById: completed ? userId : null, completedAt: completed ? new Date() : null },
      });
      await tx.entry.update({ where: { id: transfer.sourceEntryId }, data: { followStatus: status } });
      await tx.auditEvent.create({ data: { actorUserId: userId, action: "FOLLOW_STATUS_UPDATED", entityType: "FollowTransfer", entityId: transferId, before: { status: transfer.status }, after: { status } } });
      return updated;
    });
  }
}
