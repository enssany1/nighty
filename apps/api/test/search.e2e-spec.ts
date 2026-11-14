import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

describe("indexed entry search (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: "aisha", password: "NightyDemo!2026" }).expect(201);
    cookie = login.headers["set-cookie"]?.[0] as string;
  });

  afterAll(async () => { if (app) await app.close(); });

  it("combines every approved filter and returns a stable canvas destination", async () => {
    const follow = await prisma.entry.findFirstOrThrow({
      where: { type: "FOLLOW" }, include: { tags: true, shiftInstance: true },
    });
    const query = new URLSearchParams({
      q: "monitoring", from: "2026-11-13", to: "2026-11-13", operator: follow.authorId,
      shift: follow.shiftInstance.definitionId, tag: follow.tags[0]!.tagId, type: "FOLLOW", followStatus: "OPEN",
    });
    const response = await request(app.getHttpServer()).get(`/api/search?${query}`).set("Cookie", cookie).expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      entryId: follow.id, shiftInstanceId: follow.shiftInstanceId, operationalDate: "2026-11-13", type: "FOLLOW",
    });
    const empty = await request(app.getHttpServer()).get("/api/search?q=definitely-not-present").set("Cookie", cookie).expect(200);
    expect(empty.body.items).toEqual([]);
  });

  it("pages deterministically and has the owned PostgreSQL search index", async () => {
    const first = await request(app.getHttpServer()).get("/api/search?take=1").set("Cookie", cookie).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app.getHttpServer()).get(`/api/search?take=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set("Cookie", cookie).expect(200);
    expect(second.body.items[0].entryId).not.toBe(first.body.items[0].entryId);
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Entry'
    `;
    expect(indexes.map((index) => index.indexname)).toContain("Entry_plainText_trgm_idx");
  });
});
