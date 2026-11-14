import "reflect-metadata";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Image update" }] }] };

describe("attachment security (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageRoot: string;
  let cookie: string;
  let csrf: string;
  let postId: string;
  let attachmentId: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), "nighty-uploads-"));
    process.env.ATTACHMENTS_PATH = storageRoot;
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
    const tag = await prisma.tag.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const post = await request(app.getHttpServer()).post(`/api/tags/${tag.id}/posts`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ editorDocument: doc }).expect(201);
    postId = post.body.id;
  });

  afterAll(async () => {
    if (postId) await prisma.tagPost.delete({ where: { id: postId } }).catch(() => undefined);
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    delete process.env.ATTACHMENTS_PATH;
  });

  it("stores a pasted image inline with a random safe key and authenticated download", async () => {
    const response = await request(app.getHttpServer()).post("/api/attachments")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("parentType", "tagPost").field("parentId", postId).field("disposition", "INLINE")
      .attach("file", png, { filename: "../../roster.png", contentType: "image/png" }).expect(201);
    attachmentId = response.body.id;
    expect(response.body.originalName).toBe("roster.png");
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(stored.storageKey).toMatch(/^[a-f0-9]{64}$/);
    expect(path.dirname(path.resolve(storageRoot, stored.storageKey))).toBe(path.resolve(storageRoot));
    expect(await readFile(path.resolve(storageRoot, stored.storageKey))).toEqual(png);
    await request(app.getHttpServer()).get(`/api/attachments/${attachmentId}/download`).expect(401);
    await request(app.getHttpServer()).get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookie).expect(200);
  });

  it("rejects MIME mismatch, non-image inline content, and oversized files without metadata", async () => {
    await request(app.getHttpServer()).post("/api/attachments")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("parentType", "tagPost").field("parentId", postId).field("disposition", "INLINE")
      .attach("file", png, { filename: "wrong.jpg", contentType: "image/jpeg" }).expect(400);
    await request(app.getHttpServer()).post("/api/attachments")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("parentType", "tagPost").field("parentId", postId).field("disposition", "INLINE")
      .attach("file", Buffer.from("plain text"), { filename: "note.txt", contentType: "text/plain" }).expect(400);
    await request(app.getHttpServer()).post("/api/attachments")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("parentType", "tagPost").field("parentId", postId).field("disposition", "ATTACHMENT")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1, 1), { filename: "large.bin", contentType: "application/octet-stream" }).expect(413);
  });
});
