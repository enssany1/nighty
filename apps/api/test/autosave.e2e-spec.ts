import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("entry autosave (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  let shiftId: string;
  let entryId: string;

  const patch = (text: string, extra: Record<string, unknown> = {}) => request(app.getHttpServer()).patch(`/api/entries/${entryId}`)
    .set("Cookie", cookie).set("x-csrf-token", csrf).send({ type: "UPDATE", editorDocument: doc(text), plainText: text, ...extra });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
    shiftId = (await prisma.shiftInstance.findFirstOrThrow({ where: { status: "ACTIVE" } })).id;
    const created = await request(app.getHttpServer()).post(`/api/shift-instances/${shiftId}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ type: "UPDATE", editorDocument: doc("Aut"), plainText: "Aut" }).expect(201);
    entryId = created.body.id;
  });

  afterAll(async () => {
    if (entryId) {
      await prisma.auditEvent.deleteMany({ where: { entityId: entryId } });
      await prisma.entry.deleteMany({ where: { id: entryId } });
    }
    if (app) await app.close();
  });

  it("folds continuous typing by the same author into the entry without revisions or audit noise", async () => {
    await patch("Autosaved dra", { autosave: true }).expect(200);
    const saved = await patch("Autosaved draft complete", { autosave: true }).expect(200);
    expect(saved.body.plainText).toBe("Autosaved draft complete");
    expect(await prisma.entryRevision.count({ where: { entryId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityId: entryId, action: "ENTRY_EDITED" } })).toBe(0);
  });

  it("can turn the entry being typed into a Follow without a revision", async () => {
    const saved = await patch("Autosaved draft complete", { autosave: true, type: "FOLLOW" }).expect(200);
    expect(saved.body).toMatchObject({ type: "FOLLOW", followStatus: "OPEN" });
    await patch("Autosaved draft complete", { autosave: true }).expect(200);
    expect(await prisma.entryRevision.count({ where: { entryId } })).toBe(0);
  });

  it("still records a revision for an explicit edit", async () => {
    await patch("Explicitly edited").expect(200);
    const history = await prisma.entryRevision.findMany({ where: { entryId } });
    expect(history.map((revision) => revision.plainText)).toEqual(["Autosaved draft complete"]);
    expect(await prisma.auditEvent.count({ where: { entityId: entryId, action: "ENTRY_EDITED" } })).toBe(1);
  });

  it("records a revision when autosave resumes after the typing window has passed", async () => {
    await prisma.entry.update({ where: { id: entryId }, data: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
    await patch("Edited much later", { autosave: true }).expect(200);
    await patch("Edited much later, continued", { autosave: true }).expect(200);
    const history = await prisma.entryRevision.findMany({ where: { entryId }, orderBy: { revisionNumber: "asc" } });
    expect(history.map((revision) => revision.plainText)).toEqual(["Autosaved draft complete", "Explicitly edited"]);
    expect(await prisma.auditEvent.count({ where: { entityId: entryId, action: "ENTRY_EDITED" } })).toBe(2);
  });
});
