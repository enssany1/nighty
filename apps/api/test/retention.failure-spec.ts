import "reflect-metadata";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";
import { RETENTION_FILE_DELETE } from "../src/retention/retention.service";

describe("retention file failure and retry (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageRoot: string;
  let dayId: string;
  let filePath: string;
  let cookie: string;
  let csrf: string;
  const deleteFile = jest.fn<Promise<void>, [string]>();

  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), "nighty-retention-"));
    process.env.ATTACHMENTS_PATH = storageRoot;
    deleteFile.mockRejectedValueOnce(new Error("simulated sharing violation")).mockImplementation((target) => unlink(target));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RETENTION_FILE_DELETE).useValue(deleteFile).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const user = await prisma.user.findFirstOrThrow({ where: { username: "aisha" } });
    const definition = await prisma.shiftDefinition.findFirstOrThrow({ orderBy: { position: "asc" } });
    const day = await prisma.operationalDay.create({
      data: {
        operationalDate: new Date("2020-01-01T00:00:00.000Z"), boundaryMinute: definition.startMinute,
        shiftInstances: { create: {
          definitionId: definition.id, nameSnapshot: definition.name, startMinuteSnapshot: definition.startMinute,
          endMinuteSnapshot: definition.endMinute, positionSnapshot: 99, status: "UPCOMING",
          entries: { create: { authorId: user.id, type: "UPDATE", editorDocument: { type: "doc", content: [] }, plainText: "old retention record" } },
        } },
      },
      include: { shiftInstances: { include: { entries: true } } },
    });
    dayId = day.id;
    const key = "a".repeat(64);
    filePath = path.join(storageRoot, key);
    const bytes = Buffer.from("retained file");
    await writeFile(filePath, bytes);
    await prisma.attachment.create({ data: {
      storageKey: key, originalName: "old.txt", mimeType: "text/plain", byteSize: BigInt(bytes.length),
      sha256: (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"), disposition: "ATTACHMENT",
      entryId: day.shiftInstances[0]!.entries[0]!.id, uploadedById: user.id,
    } });
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
    csrf = login.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.operationalDay.delete({ where: { id: dayId } }).catch(() => undefined);
    if (app) await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.ATTACHMENTS_PATH;
  });

  it("previews without mutation, retains failed ownership, retries, and becomes idempotent", async () => {
    const preview = await request(app.getHttpServer()).get("/api/retention/preview").set("Cookie", cookie).expect(200);
    expect(preview.body.eligibleOperationalDays).toBeGreaterThanOrEqual(1);
    expect((await prisma.operationalDay.findUniqueOrThrow({ where: { id: dayId } })).retentionState).toBe("ACTIVE");

    const failed = await request(app.getHttpServer()).post("/api/retention/run")
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(failed.body.failed).toBeGreaterThanOrEqual(1);
    expect((await prisma.operationalDay.findUniqueOrThrow({ where: { id: dayId } })).retentionState).toBe("FAILED");

    const recovered = await request(app.getHttpServer()).post("/api/retention/run")
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(recovered.body.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.operationalDay.findUnique({ where: { id: dayId } })).toBeNull();
    const repeat = await request(app.getHttpServer()).post("/api/retention/run")
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(201);
    expect(repeat.body.deleted).toBe(0);
    expect(deleteFile).toHaveBeenCalledWith(filePath);
    expect(await prisma.auditEvent.count({ where: { action: "RETENTION_RUN" } })).toBeGreaterThanOrEqual(3);
  });
});
