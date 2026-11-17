import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { resolveOperationalMoment } from "./operational-clock";
import { isRetryableSerializationError, transitionShift } from "./shift-transition";

export interface RolloverResult {
  operationalDate: string;
  closedShiftId: string | null;
  openedShiftId: string;
  transferredFollowCount: number;
}

const DEFAULT_TIMEZONE = "Asia/Muscat";

/**
 * Starts a new operational day automatically once the calendar has moved past the day
 * that holds the active shift. Handover between shifts of the same day stays manual.
 */
@Injectable()
export class DayRolloverService {
  private readonly logger = new Logger(DayRolloverService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return (process.env.DAY_ROLLOVER ?? "automatic").toLowerCase() !== "manual";
  }

  async rollForward(now: Date = new Date()): Promise<RolloverResult | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.rollForwardTransaction(tx, now),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const duplicateDay = (error as { code?: unknown } | null)?.code === "P2002";
        if ((isRetryableSerializationError(error) || duplicateDay) && attempt < 2) continue;
        throw error;
      }
    }
    return null;
  }

  /** Never lets a rollover problem block reading the current operational day. */
  async rollForwardSafely(now: Date = new Date()): Promise<void> {
    if (!this.enabled) return;
    try { await this.rollForward(now); } catch (error) {
      this.logger.warn(`Automatic day rollover failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async rollForwardTransaction(tx: Prisma.TransactionClient, now: Date): Promise<RolloverResult | null> {
    const definitions = await tx.shiftDefinition.findMany({
      where: { active: true }, orderBy: { position: "asc" }, include: { assignments: true },
    });
    if (definitions.length === 0) return null;
    const setting = await tx.appSetting.findUnique({ where: { key: "timezone" }, select: { value: true } });
    const timezone = typeof setting?.value === "string" && setting.value.trim() ? setting.value : DEFAULT_TIMEZONE;
    const target = resolveOperationalMoment(now, timezone, definitions);
    if (!target) return null;
    const targetDate = new Date(`${target.operationalDate}T00:00:00.000Z`);

    const active = await tx.shiftInstance.findFirst({
      where: { status: "ACTIVE" }, orderBy: { operationalDay: { operationalDate: "desc" } }, include: { operationalDay: true },
    });
    if (active) {
      await tx.$queryRaw`SELECT id FROM "ShiftInstance" WHERE id = ${active.id}::uuid FOR UPDATE`;
      const locked = await tx.shiftInstance.findUnique({ where: { id: active.id }, select: { status: true } });
      if (locked?.status !== "ACTIVE") return null;
    }
    const latest = active?.operationalDay ?? await tx.operationalDay.findFirst({ orderBy: { operationalDate: "desc" } });
    if (!latest || latest.operationalDate.getTime() >= targetDate.getTime()) return null;

    let day = await tx.operationalDay.findUnique({
      where: { operationalDate: targetDate }, include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
    });
    if (!day) {
      day = await tx.operationalDay.create({
        data: {
          operationalDate: targetDate, boundaryMinute: definitions[0]!.startMinute,
          shiftInstances: { create: definitions.map((definition) => ({
            definitionId: definition.id, nameSnapshot: definition.name,
            startMinuteSnapshot: definition.startMinute, endMinuteSnapshot: definition.endMinute,
            positionSnapshot: definition.position, status: "UPCOMING" as const,
            assignmentSnapshots: { create: definition.assignments.map((assignment) => ({ userId: assignment.userId })) },
          })) },
        },
        include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
      });
    }
    const scheduled = resolveOperationalMoment(now, timezone, day.shiftInstances.map((shift) => ({
      position: shift.positionSnapshot, startMinute: shift.startMinuteSnapshot, endMinute: shift.endMinuteSnapshot,
    })));
    const opening = day.shiftInstances.find((shift) => shift.positionSnapshot === scheduled?.position && scheduled.operationalDate === target.operationalDate)
      ?? day.shiftInstances.find((shift) => shift.status === "UPCOMING");
    if (!opening || opening.status !== "UPCOMING") return null;

    let transferredFollowCount = 0;
    if (active) {
      transferredFollowCount = await transitionShift(tx, active.id, opening.id, now);
      // Shifts of the stale day that were never opened can no longer be handed over;
      // the lifecycle constraint requires a closed shift to carry both timestamps.
      await tx.shiftInstance.updateMany({
        where: { operationalDayId: active.operationalDayId, status: "UPCOMING" },
        data: { status: "CLOSED", openedAt: now, closedAt: now, version: { increment: 1 } },
      });
    } else {
      await tx.shiftInstance.update({ where: { id: opening.id }, data: { status: "ACTIVE", openedAt: now, closedAt: null, version: { increment: 1 } } });
    }
    // Earlier shifts of the new day have already passed on the clock.
    await tx.shiftInstance.updateMany({
      where: { operationalDayId: day.id, status: "UPCOMING", positionSnapshot: { lt: opening.positionSnapshot } },
      data: { status: "CLOSED", openedAt: now, closedAt: now, version: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: {
        action: "SHIFT_AUTO_ROLLOVER", entityType: "ShiftInstance", entityId: active?.id ?? opening.id,
        before: active ? { status: "ACTIVE", operationalDate: active.operationalDay.operationalDate.toISOString().slice(0, 10) } : Prisma.JsonNull,
        after: { openedShiftId: opening.id, operationalDate: target.operationalDate, transferredFollowCount },
      },
    });
    return { operationalDate: target.operationalDate, closedShiftId: active?.id ?? null, openedShiftId: opening.id, transferredFollowCount };
  }
}
