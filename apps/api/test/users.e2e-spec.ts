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
});
