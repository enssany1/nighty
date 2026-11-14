import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("Tag whiteboards (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  const createdTagIds: string[] = [];

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
    await prisma.tagPost.deleteMany({ where: { tagId: { in: createdTagIds } } });
    await prisma.tag.deleteMany({ where: { id: { in: createdTagIds } } });
    const remaining = await prisma.tag.findMany({ orderBy: { position: "asc" } });
    for (const [index, tag] of remaining.entries()) await prisma.tag.update({ where: { id: tag.id }, data: { position: 10_000 + index } });
    for (const [index, tag] of remaining.entries()) await prisma.tag.update({ where: { id: tag.id }, data: { position: index + 1 } });
    if (app) await app.close();
  });

  it("reorders stably, rejects rename conflicts, sorts posts newest-first, and preserves archived history", async () => {
    for (const name of ["e2e-alpha", "e2e-beta"]) {
      const created = await request(app.getHttpServer()).post("/api/tags")
        .set("Cookie", cookie).set("x-csrf-token", csrf).send({ name }).expect(201);
      createdTagIds.push(created.body.id);
    }
    await request(app.getHttpServer()).patch(`/api/tags/${createdTagIds[1]}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ name: "e2e-alpha" }).expect(409);

    const all = await prisma.tag.findMany({ orderBy: { position: "asc" } });
    const order = all.map((tag) => tag.id).reverse();
    const reordered = await request(app.getHttpServer()).post("/api/tags/reorder")
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ tagIds: order }).expect(201);
    expect(reordered.body.map((tag: { id: string }) => tag.id)).toEqual(order);

    const first = await request(app.getHttpServer()).post(`/api/tags/${createdTagIds[0]}/posts`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ editorDocument: doc("first") }).expect(201);
    await prisma.tagPost.update({ where: { id: first.body.id }, data: { createdAt: new Date("2026-01-01T00:00:00.000Z") } });
    const second = await request(app.getHttpServer()).post(`/api/tags/${createdTagIds[0]}/posts`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ editorDocument: doc("second") }).expect(201);
    const posts = await request(app.getHttpServer()).get(`/api/tags/${createdTagIds[0]}/posts`).set("Cookie", cookie).expect(200);
    expect(posts.body.map((post: { id: string }) => post.id).slice(0, 2)).toEqual([second.body.id, first.body.id]);

    await request(app.getHttpServer()).patch(`/api/tags/${createdTagIds[0]}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ archived: true }).expect(200);
    await request(app.getHttpServer()).post(`/api/tags/${createdTagIds[0]}/posts`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ editorDocument: doc("blocked") }).expect(409);
    await request(app.getHttpServer()).get(`/api/tags/${createdTagIds[0]}/posts`).set("Cookie", cookie).expect(200);
    await request(app.getHttpServer()).delete(`/api/tags/${createdTagIds[0]}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).expect(409);
  });
});
