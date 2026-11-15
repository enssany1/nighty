import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

describe("users administration (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  let createdUserId: string | undefined;
  let referencedUserId: string | undefined;

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

  afterAll(async () => {
    if (createdUserId) await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
    if (referencedUserId) {
      await prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: referencedUserId }, { entityId: referencedUserId }] } });
      await prisma.user.delete({ where: { id: referencedUserId } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("creates a normalized multi-shift user and records audit evidence", async () => {
    const shifts = await prisma.shiftDefinition.findMany({ take: 2, orderBy: { position: "asc" } });
    const response = await request(app.getHttpServer()).post("/api/users")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ username: "  E2E.Operator  ", displayName: "E2E Operator", role: "OPERATOR", shiftIds: shifts.map((shift) => shift.id) })
      .expect(201);
    createdUserId = response.body.user.id;
    const userId = createdUserId!;
    expect(response.body.user.username).toBe("e2e.operator");
    expect(response.body.user.shiftIds).toHaveLength(2);
    expect(response.body.temporaryPassword).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: userId, action: "USER_CREATED" } });
    expect(audit).not.toBeNull();
  });

  it("returns a reset password once, forces change, and revokes sessions", async () => {
    const userId = createdUserId!;
    const response = await request(app.getHttpServer()).post(`/api/users/${userId}/reset-password`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(response.body.temporaryPassword).toEqual(expect.any(String));
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.passwordHash).not.toBe(response.body.temporaryPassword);
  });

  it("rejects deleting the last active administrator through DELETE", async () => {
    const aisha = await prisma.user.findUniqueOrThrow({ where: { username: "aisha" } });
    expect(await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })).toBe(1);
    await request(app.getHttpServer()).delete(`/api/users/${aisha.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aisha.id } })).status).toBe("ACTIVE");
  });

  it("permanently deletes an unused user and records the lifecycle audit", async () => {
    const userId = createdUserId!;
    const response = await request(app.getHttpServer()).delete(`/api/users/${userId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(200);
    expect(response.body).toEqual({ outcome: "DELETED", id: userId });
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.auditEvent.findFirst({ where: { entityId: userId, action: "USER_DELETED" } })).not.toBeNull();
    createdUserId = undefined;
  });

  it("deactivates a user referenced by audit history without erasing actor identity", async () => {
    const shift = await prisma.shiftDefinition.findFirstOrThrow({ orderBy: { position: "asc" } });
    const created = await request(app.getHttpServer()).post("/api/users")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ username: "audit.operator", displayName: "Audit Operator", role: "OPERATOR", shiftIds: [shift.id] })
      .expect(201);
    referencedUserId = created.body.user.id;
    const userId = referencedUserId!;
    const sourceAudit = await prisma.auditEvent.create({
      data: { actorUserId: userId, action: "TEST_HISTORICAL_ACTION", entityType: "TestFixture", entityId: userId },
    });
    const response = await request(app.getHttpServer()).delete(`/api/users/${userId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(200);
    expect(response.body).toMatchObject({ outcome: "DEACTIVATED", user: { id: userId, status: "DISABLED", shiftIds: [] } });
    expect(await prisma.shiftAssignment.count({ where: { userId } })).toBe(0);
    expect((await prisma.auditEvent.findUniqueOrThrow({ where: { id: sourceAudit.id } })).actorUserId).toBe(userId);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: userId, action: "USER_DEACTIVATED" } })).not.toBeNull();
  });
});
