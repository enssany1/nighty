import "reflect-metadata";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("daily canvas (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;
  const createdEntryIds: string[] = [];
  const createdUserIds: string[] = [];

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
    await prisma.entry.deleteMany({ where: { id: { in: createdEntryIds } } });
    await prisma.shiftInstanceAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (app) await app.close();
  });

  it("renders current, previous, and upcoming shifts with state-derived write permission", async () => {
    const day = await prisma.operationalDay.findFirstOrThrow({ include: { shiftInstances: true } });
    const date = day.operationalDate.toISOString().slice(0, 10);
    const response = await request(app.getHttpServer()).get(`/api/canvas/${date}`).set("Cookie", cookie).expect(200);
    const active = response.body.shifts.find((shift: { status: string }) => shift.status === "ACTIVE");
    const closed = response.body.shifts.find((shift: { status: string }) => shift.status === "CLOSED");
    const upcoming = response.body.shifts.find((shift: { status: string }) => shift.status === "UPCOMING");
    expect(active.writable).toBe(true);
    expect(closed.writable).toBe(false);
    expect(upcoming.writable).toBe(false);

    const passwordHash = (await prisma.user.findUniqueOrThrow({ where: { username: "aisha" }, select: { passwordHash: true } })).passwordHash;
    const assignedId = randomUUID(); const unassignedId = randomUUID();
    createdUserIds.push(assignedId, unassignedId);
    await prisma.user.createMany({ data: [
      { id: assignedId, username: `canvas.assigned.${assignedId.slice(0,8)}`, displayName: "Canvas Assigned", passwordHash, role: "OPERATOR" },
      { id: unassignedId, username: `canvas.unassigned.${unassignedId.slice(0,8)}`, displayName: "Canvas Unassigned", passwordHash, role: "OPERATOR" },
    ] });
    await prisma.shiftInstanceAssignment.create({ data: { shiftInstanceId: active.id, userId: assignedId } });
    const assignedLogin = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: `canvas.assigned.${assignedId.slice(0,8)}`, password: "NightyDemo!2026" }).expect(201);
    const assignedCanvas = await request(app.getHttpServer()).get(`/api/canvas/${date}`)
      .set("Cookie", assignedLogin.headers["set-cookie"]?.[0] as string).expect(200);
    expect(assignedCanvas.body.shifts.find((shift: { status: string }) => shift.status === "ACTIVE").writable).toBe(true);

    const unassignedLogin = await request(app.getHttpServer()).post("/api/auth/login")
      .send({ username: `canvas.unassigned.${unassignedId.slice(0,8)}`, password: "NightyDemo!2026" }).expect(201);
    const unassignedCanvas = await request(app.getHttpServer()).get(`/api/canvas/${date}`)
      .set("Cookie", unassignedLogin.headers["set-cookie"]?.[0] as string).expect(200);
    expect(unassignedCanvas.body.shifts.find((shift: { status: string }) => shift.status === "ACTIVE").writable).toBe(false);
  });

  it("creates normalized entries, toggles one To-do, and snapshots edits", async () => {
    const active = await prisma.shiftInstance.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const todo = await request(app.getHttpServer()).post(`/api/shift-instances/${active.id}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "TODO", editorDocument: doc("ignored title"), plainText: "client text", todoItems: [
        { text: " first ", position: 1 }, { text: " ", position: 2 }, { text: "second", position: 3 },
      ] }).expect(201);
    createdEntryIds.push(todo.body.id);
    expect(todo.body.todoItems.map((item: { text: string }) => item.text)).toEqual(["first", "second"]);
    const toggled = await request(app.getHttpServer()).patch(`/api/todo-items/${todo.body.todoItems[0].id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf).send({ completed: true }).expect(200);
    expect(toggled.body.completed).toBe(true);
    expect(todo.body.todoItems[1].completed).toBe(false);

    const update = await request(app.getHttpServer()).post(`/api/shift-instances/${active.id}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "UPDATE", editorDocument: doc("Original"), plainText: "forged" }).expect(201);
    createdEntryIds.push(update.body.id);
    expect(update.body.plainText).toBe("Original");
    await request(app.getHttpServer()).patch(`/api/entries/${update.body.id}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "UPDATE", editorDocument: doc("Edited"), plainText: "forged again" }).expect(200);
    const history = await request(app.getHttpServer()).get(`/api/entries/${update.body.id}/history`).set("Cookie", cookie).expect(200);
    expect(history.body[0].plainText).toBe("Original");
  });

  it("rejects blank updates, unsupported nodes, and upcoming writes", async () => {
    const active = await prisma.shiftInstance.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const upcoming = await prisma.shiftInstance.findFirstOrThrow({ where: { status: "UPCOMING" } });
    await request(app.getHttpServer()).post(`/api/shift-instances/${active.id}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "UPDATE", editorDocument: doc(" "), plainText: "forged" }).expect(400);
    await request(app.getHttpServer()).post(`/api/shift-instances/${active.id}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "UPDATE", editorDocument: { type: "doc", content: [{ type: "script" }] }, plainText: "bad" }).expect(400);
    await request(app.getHttpServer()).post(`/api/shift-instances/${upcoming.id}/entries`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ type: "FOLLOW", editorDocument: doc("Future"), plainText: "Future" }).expect(403);
  });
});
