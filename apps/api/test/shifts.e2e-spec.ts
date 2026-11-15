import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

describe("shift schedules (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  let extraActiveIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
    const active = await prisma.shiftDefinition.findMany({ where: { active: true }, select: { id: true, name: true } });
    extraActiveIds = active.filter((shift) => !["Morning", "Evening", "Night"].includes(shift.name)).map((shift) => shift.id);
    if (extraActiveIds.length) await prisma.shiftDefinition.updateMany({ where: { id: { in: extraActiveIds } }, data: { active: false } });
  });

  afterAll(async () => { if (extraActiveIds.length) await prisma.shiftDefinition.updateMany({ where: { id: { in: extraActiveIds } }, data: { active: true } }); if (app) await app.close(); });

  it("allows overlaps but rejects a one-minute coverage gap", async () => {
    const shifts = await prisma.shiftDefinition.findMany({ orderBy: { position: "asc" } });
    const morning = shifts[0]!;
    try {
      await request(app.getHttpServer()).patch(`/api/shifts/${morning.id}`)
        .set("Cookie", cookie).set("x-csrf-token", csrf)
        .send({ startMinute: morning.startMinute, endMinute: morning.endMinute + 60, name: morning.name, active: true })
        .expect(200);
      await request(app.getHttpServer()).patch(`/api/shifts/${morning.id}`)
        .set("Cookie", cookie).set("x-csrf-token", csrf)
        .send({ startMinute: morning.startMinute + 1, endMinute: morning.endMinute, name: morning.name, active: true })
        .expect(400);
    } finally {
      await prisma.shiftDefinition.update({ where: { id: morning.id }, data: { startMinute: morning.startMinute, endMinute: morning.endMinute, name: morning.name, active: morning.active } });
    }
  });

  it("materializes immutable definition and assignment snapshots", async () => {
    const date = "2030-01-03";
    const first = await request(app.getHttpServer()).post(`/api/operational-days/${date}/materialize`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    const snapshot = first.body.shiftInstances[0];
    const definition = await prisma.shiftDefinition.findUniqueOrThrow({ where: { id: snapshot.definitionId } });
    try {
      await request(app.getHttpServer()).patch(`/api/shifts/${definition.id}`)
        .set("Cookie", cookie).set("x-csrf-token", csrf)
        .send({ name: `${definition.name} edited`, startMinute: definition.startMinute, endMinute: definition.endMinute, active: true })
        .expect(200);
      const second = await request(app.getHttpServer()).post(`/api/operational-days/${date}/materialize`)
        .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
      expect(second.body.shiftInstances[0].nameSnapshot).toBe(snapshot.nameSnapshot);
      expect(second.body.shiftInstances[0].assignments).toEqual(snapshot.assignments);
    } finally {
      await prisma.shiftDefinition.update({ where: { id: definition.id }, data: { name: definition.name, startMinute: definition.startMinute, endMinute: definition.endMinute, active: definition.active } });
    }
  });

  it("rejects duplicate active names and reorders without unique-position collisions", async () => {
    const shifts = await prisma.shiftDefinition.findMany({ orderBy: { position: "asc" } });
    await request(app.getHttpServer()).patch(`/api/shifts/${shifts[0]!.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: shifts[1]!.name.toUpperCase(), startMinute: shifts[0]!.startMinute, endMinute: shifts[0]!.endMinute, active: true })
      .expect(400);
    const reversed = shifts.map((shift) => shift.id).reverse();
    const reordered = await request(app.getHttpServer()).post("/api/shifts/reorder")
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ shiftIds: reversed }).expect(201);
    expect(reordered.body.map((shift: { id: string }) => shift.id)).toEqual(reversed);
    await request(app.getHttpServer()).post("/api/shifts/reorder")
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ shiftIds: shifts.map((shift) => shift.id) }).expect(201);
  });

  it("deletes an unused redundant shift and audits the outcome", async () => {
    const created = await request(app.getHttpServer()).post("/api/shifts")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: "Temporary overlap", startMinute: 0, endMinute: 720, active: true }).expect(201);
    const response = await request(app.getHttpServer()).delete(`/api/shifts/${created.body.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(200);
    expect(response.body).toEqual({ outcome: "DELETED", id: created.body.id });
    expect(await prisma.shiftDefinition.findUnique({ where: { id: created.body.id } })).toBeNull();
    expect(await prisma.auditEvent.findFirst({ where: { entityId: created.body.id, action: "SHIFT_DELETED" } })).not.toBeNull();
  });

  it("rejects DELETE when removing the shift would create a coverage gap", async () => {
    const morning = await prisma.shiftDefinition.findFirstOrThrow({ where: { name: "Morning", active: true } });
    await request(app.getHttpServer()).delete(`/api/shifts/${morning.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(400);
    expect((await prisma.shiftDefinition.findUniqueOrThrow({ where: { id: morning.id } })).active).toBe(true);
    expect(await prisma.auditEvent.count({ where: { entityId: morning.id, action: { in: ["SHIFT_DELETED", "SHIFT_DEACTIVATED"] } } })).toBe(0);
  });

  it("deactivates a referenced redundant shift, removes future assignments, and preserves history", async () => {
    const created = await request(app.getHttpServer()).post("/api/shifts")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: "Referenced overlap", startMinute: 0, endMinute: 720, active: true }).expect(201);
    const aisha = await prisma.user.findUniqueOrThrow({ where: { username: "aisha" } });
    const date = new Date(Date.UTC(2250, 0, 1 + Math.floor(Math.random() * 10000)));
    const day = await prisma.operationalDay.create({
      data: {
        operationalDate: date, boundaryMinute: 0,
        shiftInstances: { create: { definitionId: created.body.id, nameSnapshot: created.body.name, startMinuteSnapshot: 0, endMinuteSnapshot: 720, positionSnapshot: 1 } },
      },
    });
    await prisma.shiftAssignment.create({ data: { shiftDefinitionId: created.body.id, userId: aisha.id } });
    try {
      const response = await request(app.getHttpServer()).delete(`/api/shifts/${created.body.id}`)
        .set("Cookie", cookie).set("x-csrf-token", csrf).expect(200);
      expect(response.body).toMatchObject({ outcome: "DEACTIVATED", shift: { id: created.body.id, active: false } });
      expect(await prisma.shiftAssignment.count({ where: { shiftDefinitionId: created.body.id } })).toBe(0);
      expect(await prisma.shiftInstance.count({ where: { definitionId: created.body.id } })).toBe(1);
      expect(await prisma.auditEvent.findFirst({ where: { entityId: created.body.id, action: "SHIFT_DEACTIVATED" } })).not.toBeNull();
    } finally {
      await prisma.operationalDay.delete({ where: { id: day.id } });
      await prisma.auditEvent.deleteMany({ where: { entityId: created.body.id } });
      await prisma.shiftDefinition.delete({ where: { id: created.body.id } });
    }
  });
});
