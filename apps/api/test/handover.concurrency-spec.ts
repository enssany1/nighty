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
  let rolloverDayId: string | undefined;
  const transferredEntryIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const day = await prisma.operationalDay.findUniqueOrThrow({
      where: { operationalDate: new Date("2026-11-13T00:00:00.000Z") },
      include: { shiftInstances: { orderBy: { positionSnapshot: "asc" } } },
    });
    currentId = day.shiftInstances[1]!.id;
    nextId = day.shiftInstances[2]!.id;
    await prisma.$transaction(async (tx) => {
      await tx.shiftInstance.updateMany({ where: { status: "ACTIVE" }, data: { status: "UPCOMING", closedAt: null } });
      await tx.shiftInstance.update({ where: { id: currentId }, data: { status: "ACTIVE", openedAt: new Date("2026-11-13T15:00:00.000Z"), closedAt: null } });
      await tx.shiftInstance.update({ where: { id: nextId }, data: { status: "UPCOMING", openedAt: null, closedAt: null } });
      await tx.followTransfer.deleteMany({ where: { fromShiftInstanceId: currentId } });
    });
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.followTransfer.deleteMany({ where: { fromShiftInstanceId: nextId } });
      await tx.followTransfer.deleteMany({ where: { fromShiftInstanceId: currentId } });
      if (transferredEntryIds.length) await tx.entry.updateMany({ where: { id: { in: transferredEntryIds } }, data: { followStatus: "OPEN" } });
      if (rolloverDayId) await tx.operationalDay.delete({ where: { id: rolloverDayId } });
      await tx.shiftInstance.update({ where: { id: nextId }, data: { status: "UPCOMING", openedAt: null, closedAt: null } });
      await tx.shiftInstance.update({ where: { id: currentId }, data: { status: "ACTIVE", openedAt: new Date("2026-11-13T15:00:00.000Z"), closedAt: null } });
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
    transferredEntryIds.push(...transfers.map((transfer) => transfer.sourceEntryId));
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
    }
  });

  it("rolls the last shift into the first shift of the next operational day without clock coupling", async () => {
    const response = await request(app.getHttpServer()).post(`/api/shift-instances/${nextId}/handover`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    const opened = await prisma.shiftInstance.findUniqueOrThrow({ where: { id: response.body.openedShiftId }, include: { operationalDay: true } });
    expect(opened.operationalDay.operationalDate.toISOString().slice(0, 10)).toBe("2026-11-14");
    expect(opened.positionSnapshot).toBe(1);
    expect(opened.status).toBe("ACTIVE");
    rolloverDayId = opened.operationalDayId;
  });
});
