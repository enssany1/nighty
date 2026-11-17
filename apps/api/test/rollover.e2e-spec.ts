import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";
import { DayRolloverService } from "../src/operations/day-rollover.service";

describe("automatic operational day rollover", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rollover: DayRolloverService;
  let staleDate: Date;
  let staleDayId: string;
  let eveningId: string;
  let nightId: string;
  let followId: string;
  let completedFollowId: string;
  let originalActive: { id: string; openedAt: Date | null; version: number } | undefined;
  let originalTimezone: { value: unknown } | null = null;
  const createdDayIds: string[] = [];

  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
  const at = (date: Date, hour: number, minute = 0) => new Date(date.getTime() + (hour * 60 + minute) * 60_000);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    rollover = app.get(DayRolloverService);
    const definitions = await prisma.shiftDefinition.findMany({ where: { active: true }, orderBy: { position: "asc" } });
    expect(definitions.map((definition) => definition.startMinute)).toEqual([420, 900, 1380]);
    const aisha = await prisma.user.findUniqueOrThrow({ where: { username: "aisha" } });
    const active = await prisma.shiftInstance.findFirstOrThrow({ where: { status: "ACTIVE" } });
    originalActive = { id: active.id, openedAt: active.openedAt, version: active.version };
    originalTimezone = await prisma.appSetting.findUnique({ where: { key: "timezone" }, select: { value: true } });
    await prisma.appSetting.upsert({ where: { key: "timezone" }, create: { key: "timezone", value: "UTC" }, update: { value: "UTC" } });
    staleDate = new Date(Date.UTC(2300, 0, 1 + Math.floor(Math.random() * 20000)));
    while (await prisma.operationalDay.findFirst({ where: { operationalDate: { gte: staleDate, lte: plusDays(staleDate, 5) } } })) staleDate = plusDays(staleDate, 7);
    await prisma.$transaction(async (tx) => {
      await tx.shiftInstance.update({ where: { id: active.id }, data: { status: "UPCOMING", openedAt: null, closedAt: null } });
      const day = await tx.operationalDay.create({
        data: {
          operationalDate: staleDate, boundaryMinute: 420,
          shiftInstances: { create: definitions.map((definition, index) => ({
            definitionId: definition.id, nameSnapshot: definition.name, startMinuteSnapshot: definition.startMinute, endMinuteSnapshot: definition.endMinute,
            positionSnapshot: index + 1, status: index === 0 ? "CLOSED" as const : index === 1 ? "ACTIVE" as const : "UPCOMING" as const,
            openedAt: index <= 1 ? at(staleDate, 8) : null, closedAt: index === 0 ? at(staleDate, 15) : null,
            assignmentSnapshots: { create: { userId: aisha.id } },
          })) },
        }, include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
      });
      staleDayId = day.id; createdDayIds.push(day.id);
      eveningId = day.shiftInstances[1]!.id; nightId = day.shiftInstances[2]!.id;
      followId = (await tx.entry.create({ data: { shiftInstanceId: eveningId, authorId: aisha.id, type: "FOLLOW", followStatus: "OPEN", editorDocument: {}, plainText: "Rollover open follow" } })).id;
      completedFollowId = (await tx.entry.create({ data: { shiftInstanceId: eveningId, authorId: aisha.id, type: "FOLLOW", followStatus: "COMPLETED", editorDocument: {}, plainText: "Rollover done follow" } })).id;
      await tx.entry.create({ data: { shiftInstanceId: eveningId, authorId: aisha.id, type: "TODO", editorDocument: {}, plainText: "Rollover to-do" } });
    });
  });

  afterAll(async () => {
    const days = await prisma.operationalDay.findMany({ where: { operationalDate: { gte: staleDate, lte: plusDays(staleDate, 5) } }, include: { shiftInstances: { select: { id: true } } } });
    const shiftIds = days.flatMap((day) => day.shiftInstances.map((shift) => shift.id));
    await prisma.$transaction(async (tx) => {
      await tx.auditEvent.deleteMany({ where: { entityId: { in: shiftIds } } });
      await tx.followTransfer.deleteMany({ where: { OR: [{ fromShiftInstanceId: { in: shiftIds } }, { toShiftInstanceId: { in: shiftIds } }] } });
      await tx.operationalDay.deleteMany({ where: { id: { in: days.map((day) => day.id) } } });
      if (originalTimezone) await tx.appSetting.update({ where: { key: "timezone" }, data: { value: originalTimezone.value as never } });
      else await tx.appSetting.deleteMany({ where: { key: "timezone" } });
      if (originalActive) await tx.shiftInstance.update({ where: { id: originalActive.id }, data: { status: "ACTIVE", openedAt: originalActive.openedAt, closedAt: null, version: originalActive.version } });
    });
    if (app) await app.close();
  });

  it("does nothing while the active shift still belongs to the current operational date", async () => {
    expect(await rollover.rollForward(at(staleDate, 23, 30))).toBeNull();
    // 03:00 on the next calendar day is still the previous operational date (first shift starts 07:00).
    expect(await rollover.rollForward(at(plusDays(staleDate, 1), 3))).toBeNull();
    expect((await prisma.shiftInstance.findUniqueOrThrow({ where: { id: eveningId } })).status).toBe("ACTIVE");
    expect(await prisma.operationalDay.count({ where: { operationalDate: plusDays(staleDate, 1) } })).toBe(0);
  });

  it("closes the stale shift and opens today's day on the shift scheduled for the current time", async () => {
    const now = at(plusDays(staleDate, 2), 16); // two days later, 16:00 → Evening
    const [first, second] = await Promise.all([rollover.rollForward(now), rollover.rollForward(now)]);
    const results = [first, second].filter(Boolean);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ operationalDate: iso(plusDays(staleDate, 2)), closedShiftId: eveningId, transferredFollowCount: 1 });

    const stale = await prisma.shiftInstance.findMany({ where: { operationalDayId: staleDayId }, orderBy: { positionSnapshot: "asc" } });
    expect(stale.map((shift) => shift.status)).toEqual(["CLOSED", "CLOSED", "CLOSED"]);
    expect(stale[1]!.closedAt).toEqual(now);
    expect(stale[2]!.openedAt).toEqual(now);
    expect(stale[2]!.closedAt).toEqual(now);

    expect(await prisma.operationalDay.count({ where: { operationalDate: plusDays(staleDate, 1) } })).toBe(0);
    const today = await prisma.operationalDay.findUniqueOrThrow({ where: { operationalDate: plusDays(staleDate, 2) }, include: { shiftInstances: { orderBy: { positionSnapshot: "asc" }, include: { assignmentSnapshots: true } } } });
    expect(today.shiftInstances.map((shift) => shift.status)).toEqual(["CLOSED", "ACTIVE", "UPCOMING"]);
    expect(today.shiftInstances[1]!.openedAt).toEqual(now);
    expect(today.shiftInstances[1]!.id).toBe(results[0]!.openedShiftId);
    expect(today.shiftInstances.every((shift) => shift.assignmentSnapshots.length > 0)).toBe(true);
    expect(await prisma.shiftInstance.count({ where: { status: "ACTIVE" } })).toBe(1);

    const transfers = await prisma.followTransfer.findMany({ where: { toShiftInstanceId: today.shiftInstances[1]!.id } });
    expect(transfers.map((transfer) => transfer.sourceEntryId)).toEqual([followId]);
    expect(transfers.some((transfer) => transfer.sourceEntryId === completedFollowId)).toBe(false);

    const audit = await prisma.auditEvent.findMany({ where: { action: "SHIFT_AUTO_ROLLOVER", entityId: eveningId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorUserId).toBeNull();
    expect(nightId).toBe(stale[2]!.id);
  });

  it("is idempotent once the day is current and never moves backwards", async () => {
    expect(await rollover.rollForward(at(plusDays(staleDate, 2), 22))).toBeNull();
    expect(await rollover.rollForward(at(staleDate, 12))).toBeNull();
    expect(await prisma.shiftInstance.count({ where: { status: "ACTIVE" } })).toBe(1);
  });

  it("carries a Follow forward again on the next rollover exactly once", async () => {
    const now = at(plusDays(staleDate, 3), 8); // next day 08:00 → Morning
    const result = await rollover.rollForward(now);
    expect(result).toMatchObject({ operationalDate: iso(plusDays(staleDate, 3)), transferredFollowCount: 1 });
    expect(await prisma.followTransfer.count({ where: { sourceEntryId: followId, toShiftInstanceId: result!.openedShiftId } })).toBe(1);
    expect(await rollover.rollForward(now)).toBeNull();
    expect(await prisma.followTransfer.count({ where: { sourceEntryId: followId } })).toBe(2);
  });
});
