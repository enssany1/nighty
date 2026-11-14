import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";

describe("Settings and immutable Audit (e2e)", () => {
  let app: INestApplication;
  let cookie: string;
  let csrf: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
  });

  afterAll(async () => {
    await request(app.getHttpServer()).patch("/api/settings/retention")
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ retentionDays: 365 }).catch(() => undefined);
    if (app) await app.close();
  });

  it("returns approved typed defaults and writes before/after metadata", async () => {
    const settings = await request(app.getHttpServer()).get("/api/settings").set("Cookie", cookie).expect(200);
    expect(settings.body.general.timezone).toBe("Asia/Muscat");
    expect(settings.body.general.timeFormat).toBe("24-hour");
    expect(settings.body.security.sessionIdleMinutes).toBe(30);

    await request(app.getHttpServer()).patch("/api/settings/retention")
      .set("Cookie", cookie).set("x-csrf-token", csrf).set("x-request-id", "audit-e2e-request")
      .send({ retentionDays: 730 }).expect(200);
    const audit = await request(app.getHttpServer()).get("/api/audit?action=SETTING_RETENTION_UPDATED&area=AppSetting")
      .set("Cookie", cookie).expect(200);
    expect(audit.body.items[0].before.retentionDays).toBe(365);
    expect(audit.body.items[0].after.retentionDays).toBe(730);
    expect(audit.body.items[0].metadata.requestId).toBe("audit-e2e-request");
    expect(audit.body.items[0].metadata.sessionId).toEqual(expect.any(String));
  });

  it("denies operators and exposes no Audit mutation route", async () => {
    const operator = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "marcus", password: "NightyDemo!2026" }).expect(201);
    const operatorCookie = operator.headers["set-cookie"]?.[0] as string;
    await request(app.getHttpServer()).get("/api/settings").set("Cookie", operatorCookie).expect(403);
    await request(app.getHttpServer()).patch("/api/audit/not-allowed")
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({}).expect(404);
    await request(app.getHttpServer()).delete("/api/audit/not-allowed")
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(404);
  });
});
