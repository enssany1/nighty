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
  });

  afterAll(async () => { if (app) await app.close(); });

  it("allows overlaps but rejects a one-minute coverage gap", async () => {
    const shifts = await prisma.shiftDefinition.findMany({ orderBy: { position: "asc" } });
    const morning = shifts[0]!;
    await request(app.getHttpServer()).patch(`/api/shifts/${morning.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ startMinute: morning.startMinute, endMinute: morning.endMinute + 60, name: morning.name, active: true })
      .expect(200);
    await request(app.getHttpServer()).patch(`/api/shifts/${morning.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ startMinute: morning.startMinute + 1, endMinute: morning.endMinute, name: morning.name, active: true })
      .expect(400);
    await request(app.getHttpServer()).patch(`/api/shifts/${morning.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ startMinute: morning.startMinute, endMinute: morning.endMinute, name: morning.name, active: true })
      .expect(200);
  });

  it("materializes immutable definition and assignment snapshots", async () => {
    const date = "2030-01-03";
    const first = await request(app.getHttpServer()).post(`/api/operational-days/${date}/materialize`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    const snapshot = first.body.shiftInstances[0];
    const definition = await prisma.shiftDefinition.findUniqueOrThrow({ where: { id: snapshot.definitionId } });
    await request(app.getHttpServer()).patch(`/api/shifts/${definition.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: `${definition.name} edited`, startMinute: definition.startMinute, endMinute: definition.endMinute, active: true })
      .expect(200);
    const second = await request(app.getHttpServer()).post(`/api/operational-days/${date}/materialize`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(second.body.shiftInstances[0].nameSnapshot).toBe(snapshot.nameSnapshot);
    expect(second.body.shiftInstances[0].assignments).toEqual(snapshot.assignments);
    await request(app.getHttpServer()).patch(`/api/shifts/${definition.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: definition.name, startMinute: definition.startMinute, endMinute: definition.endMinute, active: true })
      .expect(200);
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
});
