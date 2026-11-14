import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import pg from "pg";

const username = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
const displayName = (process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? "Nighty Administrator").trim();
if (!username && !password) process.exit(0);
if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) throw new Error("BOOTSTRAP_ADMIN_USERNAME is invalid");
if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const existing = await client.query('SELECT COUNT(*)::int AS count FROM "User"');
  if (existing.rows[0].count > 0) {
    await client.query("ROLLBACK");
    console.log("Nighty bootstrap skipped: users already exist");
    process.exit(0);
  }
  const now = new Date(); const userId = randomUUID();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  await client.query('INSERT INTO "User" (id,username,"displayName","passwordHash",role,status,"mustChangePassword","updatedAt") VALUES ($1,$2,$3,$4,\'ADMIN\',\'ACTIVE\',false,$5)', [userId, username, displayName, passwordHash, now]);
  const definitions = [
    { id: randomUUID(), name: "Morning", start: 420, end: 900, position: 1 },
    { id: randomUUID(), name: "Evening", start: 900, end: 1380, position: 2 },
    { id: randomUUID(), name: "Night", start: 1380, end: 420, position: 3 },
  ];
  for (const shift of definitions) {
    await client.query('INSERT INTO "ShiftDefinition" (id,name,"startMinute","endMinute",position,active,"updatedAt") VALUES ($1,$2,$3,$4,$5,true,$6)', [shift.id, shift.name, shift.start, shift.end, shift.position, now]);
    await client.query('INSERT INTO "ShiftAssignment" ("userId","shiftDefinitionId") VALUES ($1,$2)', [userId, shift.id]);
  }
  const dayId = randomUUID(); const day = now.toISOString().slice(0, 10);
  await client.query('INSERT INTO "OperationalDay" (id,"operationalDate","boundaryMinute") VALUES ($1,$2,420)', [dayId, day]);
  for (const shift of definitions) {
    const instanceId = randomUUID();
    await client.query('INSERT INTO "ShiftInstance" (id,"operationalDayId","definitionId","nameSnapshot","startMinuteSnapshot","endMinuteSnapshot","positionSnapshot",status,"openedAt",version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0)', [instanceId, dayId, shift.id, shift.name, shift.start, shift.end, shift.position, shift.position === 1 ? "ACTIVE" : "UPCOMING", shift.position === 1 ? now : null]);
    await client.query('INSERT INTO "ShiftInstanceAssignment" ("shiftInstanceId","userId") VALUES ($1,$2)', [instanceId, userId]);
  }
  await client.query('INSERT INTO "AuditEvent" (id,"actorUserId",action,"entityType","entityId",after) VALUES ($1,$2,\'SYSTEM_BOOTSTRAP\',\'User\',$3,$4::jsonb)', [randomUUID(), userId, userId, JSON.stringify({ username, role: "ADMIN", defaultSchedule: true })]);
  await client.query("COMMIT");
  console.log(`Nighty bootstrap created administrator ${username} and the default 24-hour schedule`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
