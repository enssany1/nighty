import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is required for seeding");
if (process.env.NODE_ENV === "production") {
  throw new Error("The deterministic development seed is disabled in production");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5_000 })
});

const ids = {
  aisha: "00000000-0000-4000-8000-000000000001",
  marcus: "00000000-0000-4000-8000-000000000002",
  daniel: "00000000-0000-4000-8000-000000000003",
  ethan: "00000000-0000-4000-8000-000000000004",
  morning: "00000000-0000-4000-8000-000000000101",
  evening: "00000000-0000-4000-8000-000000000102",
  night: "00000000-0000-4000-8000-000000000103",
  day: "00000000-0000-4000-8000-000000000201",
  morningInstance: "00000000-0000-4000-8000-000000000301",
  eveningInstance: "00000000-0000-4000-8000-000000000302",
  nightInstance: "00000000-0000-4000-8000-000000000303",
  handoverTag: "00000000-0000-4000-8000-000000000401",
  issuesTag: "00000000-0000-4000-8000-000000000402",
  maintenanceTag: "00000000-0000-4000-8000-000000000403",
  update: "00000000-0000-4000-8000-000000000501",
  todo: "00000000-0000-4000-8000-000000000502",
  follow: "00000000-0000-4000-8000-000000000503"
} as const;

const developmentPassword = process.env.SEED_ADMIN_PASSWORD ?? "NightyDemo!2026";
async function main(): Promise<void> {
  const passwordHash = await argon2.hash(developmentPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });

  await prisma.$transaction(async (tx) => {
  await tx.user.createMany({
    data: [
      { id: ids.aisha, username: "aisha", displayName: "Aisha Rahman", passwordHash, role: "ADMIN" },
      { id: ids.marcus, username: "marcus", displayName: "Marcus Lee", passwordHash, role: "OPERATOR" },
      { id: ids.daniel, username: "daniel", displayName: "Daniel Wong", passwordHash, role: "OPERATOR" },
      { id: ids.ethan, username: "ethan", displayName: "Ethan Park", passwordHash, role: "OPERATOR" }
    ],
    skipDuplicates: true
  });

  await tx.shiftDefinition.createMany({
    data: [
      { id: ids.morning, name: "Morning", startMinute: 420, endMinute: 900, position: 1 },
      { id: ids.evening, name: "Evening", startMinute: 900, endMinute: 1_380, position: 2 },
      { id: ids.night, name: "Night", startMinute: 1_380, endMinute: 420, position: 3 }
    ],
    skipDuplicates: true
  });

  await tx.shiftAssignment.createMany({
    data: [
      { userId: ids.marcus, shiftDefinitionId: ids.morning },
      { userId: ids.aisha, shiftDefinitionId: ids.evening },
      { userId: ids.daniel, shiftDefinitionId: ids.evening },
      { userId: ids.ethan, shiftDefinitionId: ids.night }
    ],
    skipDuplicates: true
  });

  await tx.operationalDay.upsert({
    where: { id: ids.day },
    create: {
      id: ids.day,
      operationalDate: new Date("2026-11-13T00:00:00.000Z"),
      boundaryMinute: 420
    },
    update: {}
  });

  await tx.shiftInstance.createMany({
    data: [
      { id: ids.morningInstance, operationalDayId: ids.day, definitionId: ids.morning, nameSnapshot: "Morning", startMinuteSnapshot: 420, endMinuteSnapshot: 900, positionSnapshot: 1, status: "CLOSED", openedAt: new Date("2026-11-13T03:00:00.000Z"), closedAt: new Date("2026-11-13T11:00:00.000Z") },
      { id: ids.eveningInstance, operationalDayId: ids.day, definitionId: ids.evening, nameSnapshot: "Evening", startMinuteSnapshot: 900, endMinuteSnapshot: 1_380, positionSnapshot: 2, status: "ACTIVE", openedAt: new Date("2026-11-13T11:00:00.000Z") },
      { id: ids.nightInstance, operationalDayId: ids.day, definitionId: ids.night, nameSnapshot: "Night", startMinuteSnapshot: 1_380, endMinuteSnapshot: 420, positionSnapshot: 3, status: "UPCOMING" }
    ],
    skipDuplicates: true
  });

  await tx.tag.createMany({
    data: [
      { id: ids.handoverTag, name: "handover", position: 1 },
      { id: ids.issuesTag, name: "issues", position: 2 },
      { id: ids.maintenanceTag, name: "maintenance", position: 3 }
    ],
    skipDuplicates: true
  });

  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }]
  });

  await tx.entry.createMany({
    data: [
      { id: ids.update, shiftInstanceId: ids.morningInstance, authorId: ids.marcus, type: "UPDATE", editorDocument: doc("Routine checks completed. Systems healthy."), plainText: "Routine checks completed. Systems healthy." },
      { id: ids.todo, shiftInstanceId: ids.eveningInstance, authorId: ids.aisha, type: "TODO", editorDocument: doc("Evening checks"), plainText: "Evening checks" },
      { id: ids.follow, shiftInstanceId: ids.eveningInstance, authorId: ids.aisha, type: "FOLLOW", editorDocument: doc("Continue monitoring the stabilized API error rate."), plainText: "Continue monitoring the stabilized API error rate.", followStatus: "OPEN" }
    ],
    skipDuplicates: true
  });

  await tx.todoItem.createMany({
    data: [
      { entryId: ids.todo, text: "Review API latency dashboard", position: 1 },
      { entryId: ids.todo, text: "Confirm backup completion", position: 2 }
    ],
    skipDuplicates: true
  });

  await tx.entryTag.createMany({
    data: [
      { entryId: ids.update, tagId: ids.handoverTag },
      { entryId: ids.follow, tagId: ids.issuesTag }
    ],
    skipDuplicates: true
  });

  await tx.appSetting.createMany({
    data: [
      { key: "retentionDays", value: 365, updatedByUserId: ids.aisha },
      { key: "sessionIdleMinutes", value: 30, updatedByUserId: ids.aisha },
      { key: "productName", value: "Nighty", updatedByUserId: ids.aisha }
    ],
    skipDuplicates: true
  });
  });

  console.log("Seeded Nighty development data for users: aisha, marcus, daniel, ethan");
}

void main()
  .catch((error: unknown) => {
    console.error("Nighty development seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
