import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

describe("manual Handover concurrency", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  let currentId: string;
  let nextId: string;
  let ownedDayIds: string[] = [];
  let ownedShiftIds: string[] = [];
  let originalActive: { id: string; status: "ACTIVE"; openedAt: Date; closedAt: null; version: number } | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const definitions = await prisma.shiftDefinition.findMany({ take: 3, orderBy: { position: "asc" } });
    const aisha = await prisma.user.findUniqueOrThrow({ where: { username: "aisha" } });
    const active = await prisma.shiftInstance.findFirstOrThrow({ where: { status: "ACTIVE" } });
    originalActive = { id: active.id, status: "ACTIVE", openedAt: active.openedAt!, closedAt: null, version: active.version };
    let baseDate = new Date(Date.UTC(2200, 0, 1 + Math.floor(Math.random() * 20000)));
    while (await prisma.operationalDay.findUnique({ where: { operationalDate: baseDate } })) baseDate = new Date(baseDate.getTime() + 2 * 86_400_000);
    const tomorrow = new Date(baseDate.getTime() + 86_400_000);
    const fixtureOpenedAt = new Date(Date.now() - 60_000);
    const fixture = await prisma.$transaction(async (tx) => {
      await tx.shiftInstance.update({ where: { id: active.id }, data: { status: "UPCOMING", openedAt: null, closedAt: null } });
      const day = await tx.operationalDay.create({
        data: {
          operationalDate: baseDate, boundaryMinute: definitions[0]!.startMinute,
          shiftInstances: { create: definitions.map((definition, index) => ({
            definitionId: definition.id, nameSnapshot: `Handover fixture ${index + 1}`,
            startMinuteSnapshot: definition.startMinute, endMinuteSnapshot: definition.endMinute,
            positionSnapshot: index + 1, status: index === 0 ? "CLOSED" : index === 1 ? "ACTIVE" : "UPCOMING",
            openedAt: index <= 1 ? fixtureOpenedAt : null, closedAt: index === 0 ? fixtureOpenedAt : null,
            assignmentSnapshots: { create: { userId: aisha.id } },
          })) },
        }, include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
      });
      const rollover = await tx.operationalDay.create({
        data: {
          operationalDate: tomorrow, boundaryMinute: definitions[0]!.startMinute,
          shiftInstances: { create: {
            definitionId: definitions[0]!.id, nameSnapshot: "Handover rollover fixture",
            startMinuteSnapshot: definitions[0]!.startMinute, endMinuteSnapshot: definitions[0]!.endMinute,
            positionSnapshot: 1, status: "UPCOMING", assignmentSnapshots: { create: { userId: aisha.id } },
          } },
        }, include: { shiftInstances: true },
      });
      const activeId = day.shiftInstances[1]!.id;
      await tx.entry.createMany({ data: [
        { shiftInstanceId: activeId, authorId: aisha.id, type: "FOLLOW", followStatus: "OPEN", editorDocument: {}, plainText: "Owned follow one" },
        { shiftInstanceId: activeId, authorId: aisha.id, type: "FOLLOW", followStatus: "OPEN", editorDocument: {}, plainText: "Owned follow two" },
        { shiftInstanceId: activeId, authorId: aisha.id, type: "TODO", editorDocument: {}, plainText: "Owned to-do" },
      ] });
      return { day, rollover };
    });
    ownedDayIds = [fixture.day.id, fixture.rollover.id];
    ownedShiftIds = [...fixture.day.shiftInstances.map((shift) => shift.id), ...fixture.rollover.shiftInstances.map((shift) => shift.id)];
    currentId = fixture.day.shiftInstances[1]!.id;
    nextId = fixture.day.shiftInstances[2]!.id;
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      const transfers = await tx.followTransfer.findMany({ where: { OR: [{ fromShiftInstanceId: { in: ownedShiftIds } }, { toShiftInstanceId: { in: ownedShiftIds } }] }, select: { id: true } });
      await tx.auditEvent.deleteMany({ where: { entityId: { in: [...ownedShiftIds, ...transfers.map((transfer) => transfer.id)] } } });
      await tx.followTransfer.deleteMany({ where: { OR: [{ fromShiftInstanceId: { in: ownedShiftIds } }, { toShiftInstanceId: { in: ownedShiftIds } }] } });
      await tx.operationalDay.deleteMany({ where: { id: { in: ownedDayIds } } });
      if (originalActive) await tx.shiftInstance.update({ where: { id: originalActive.id }, data: { status: originalActive.status, openedAt: originalActive.openedAt, closedAt: originalActive.closedAt, version: originalActive.version } });
    });
    if (app) await app.close();
  });

  it("closes/opens once and transfers every Follow but no To-do under concurrent requests", async () => {
    const openFollows = await prisma.entry.count({ where: { shiftInstanceId: currentId, type: "FOLLOW", followStatus: "OPEN" } });
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/shift-instances/${currentId}/handover`).set("Cookie", cookie).set("x-csrf-token", csrf),
      request(app.getHttpServer()).post(`/api/shift-instances/${currentId}/handover`).set("Cookie", cookie).set("x-csrf-token", csrf),
    ]);
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    const current = await prisma.shiftInstance.findUniqueOrThrow({ where: { id: currentId } });
    const next = await prisma.shiftInstance.findUniqueOrThrow({ where: { id: nextId } });
    expect(current.status).toBe("CLOSED");
    expect(next.status).toBe("ACTIVE");
    const transfers = await prisma.followTransfer.findMany({ where: { fromShiftInstanceId: currentId }, include: { sourceEntry: true } });
    expect(transfers).toHaveLength(openFollows);
    expect(transfers.every((transfer) => transfer.sourceEntry.type === "FOLLOW")).toBe(true);
    const retry = await request(app.getHttpServer()).post(`/api/shift-instances/${currentId}/handover`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(retry.body.alreadyCompleted).toBe(true);
    expect(await prisma.followTransfer.count({ where: { fromShiftInstanceId: currentId } })).toBe(openFollows);
    if (transfers[0]) {
      const completed = await request(app.getHttpServer()).patch(`/api/follows/${transfers[0].id}/status`)
        .set("Cookie", cookie).set("x-csrf-token", csrf).send({ status: "COMPLETED" }).expect(200);
      expect(completed.body.status).toBe("COMPLETED");
      expect((await prisma.entry.findUniqueOrThrow({ where: { id: transfers[0].sourceEntryId } })).followStatus).toBe("COMPLETED");
      const date = (await prisma.shiftInstance.findUniqueOrThrow({ where: { id: nextId }, include: { operationalDay: true } })).operationalDay.operationalDate.toISOString().slice(0, 10);
      const canvas = await request(app.getHttpServer()).get(`/api/canvas/${date}`).set("Cookie", cookie).expect(200);
      const visible = canvas.body.shifts.find((shift: { id: string }) => shift.id === nextId).incomingFollows
        .find((follow: { transferId: string }) => follow.transferId === transfers[0]!.id);
      expect(visible).toMatchObject({ status: "COMPLETED", completedBy: { displayName: "Aisha Rahman" } });
      expect(visible.completedAt).toBeTruthy();
    }
  });

  it("rolls the last shift into the first shift of the next operational day without clock coupling", async () => {
    const incoming = await prisma.followTransfer.findMany({ where: { toShiftInstanceId: nextId }, select: { sourceEntryId: true, status: true } });
    const response = await request(app.getHttpServer()).post(`/api/shift-instances/${nextId}/handover`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    const opened = await prisma.shiftInstance.findUniqueOrThrow({ where: { id: response.body.openedShiftId }, include: { operationalDay: true } });
    expect(ownedDayIds).toContain(opened.operationalDayId);
    expect(opened.positionSnapshot).toBe(1);
    expect(opened.status).toBe("ACTIVE");
    const forwarded = await prisma.followTransfer.findMany({ where: { fromShiftInstanceId: nextId, toShiftInstanceId: opened.id } });
    const forwardedIds = new Set(forwarded.map((transfer) => transfer.sourceEntryId));
    for (const follow of incoming.filter((item) => item.status === "OPEN")) expect(forwardedIds.has(follow.sourceEntryId)).toBe(true);
    for (const follow of incoming.filter((item) => item.status === "COMPLETED")) expect(forwardedIds.has(follow.sourceEntryId)).toBe(false);
  });
});
