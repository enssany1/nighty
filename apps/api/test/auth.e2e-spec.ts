import "reflect-metadata";
import * as argon2 from "argon2";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { Controller, Get, ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { Roles } from "../src/common/decorators/roles.decorator";
import { PrismaService } from "../src/database/prisma.service";
import { UserRole } from "../src/generated/prisma/enums";

@Controller("admin-check")
class AdminProbeController {
  @Roles(UserRole.ADMIN)
  @Get()
  check() { return { ok: true }; }
}

describe("authentication (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const username = "auth-e2e";
  const password = "NightyAuth!2026";

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule], controllers: [AdminProbeController] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.upsert({
      where: { username },
      update: { status: "ACTIVE", role: "ADMIN", passwordHash: await argon2.hash(password) },
      create: { username, displayName: "Auth E2E", status: "ACTIVE", role: "ADMIN", passwordHash: await argon2.hash(password) },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { username } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
    }
    if (app) await app.close();
  });

  it("issues a secure server session, enforces CSRF, and invalidates logout", async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ username, password }).expect(201);
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    const cookie = login.headers["set-cookie"]?.[0] as string;
    expect(cookie).toContain("nighty_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(login.body.csrfToken).toEqual(expect.any(String));

    const refreshed = await request(app.getHttpServer()).get("/api/auth/me").set("Cookie", cookie).expect(200);
    expect(refreshed.body.csrfToken).not.toBe(login.body.csrfToken);
    await request(app.getHttpServer()).post("/api/auth/logout").set("Cookie", cookie).expect(403);
    await request(app.getHttpServer()).post("/api/auth/logout").set("Cookie", cookie)
      .set("x-csrf-token", refreshed.body.csrfToken).expect(204);
    await request(app.getHttpServer()).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects operator access to an ADMIN-only route", async () => {
    await prisma.user.update({ where: { username }, data: { role: "OPERATOR" } });
    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ username, password }).expect(201);
    const cookie = login.headers["set-cookie"]?.[0] as string;
    await request(app.getHttpServer()).get("/api/admin-check").set("Cookie", cookie).expect(403);
    await prisma.user.update({ where: { username }, data: { role: "ADMIN" } });
    const adminLogin = await request(app.getHttpServer()).post("/api/auth/login").send({ username, password }).expect(201);
    await request(app.getHttpServer()).get("/api/admin-check")
      .set("Cookie", adminLogin.headers["set-cookie"]?.[0] as string).expect(200);
  });
});
