import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://nighty:nighty_dev@127.0.0.1:5432/nighty?schema=public";

describe("Nighty database ownership", () => {
  const pool = new Pool({ connectionString, max: 2 });

  afterAll(async () => pool.end());

  it("materializes every V1 owner table", async () => {
    const result = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = new Set(result.rows.map((row) => row.table_name));
    for (const table of [
      "User", "Session", "ShiftDefinition", "OperationalDay", "ShiftInstance",
      "ShiftAssignment", "Entry", "TodoItem", "FollowTransfer", "EntryRevision",
      "Tag", "TagPost", "EntryTag", "Attachment", "AuditEvent", "AppSetting",
    ]) {
      expect(tables).toContain(table);
    }
  });

  it("enforces unique identities and structural checks in PostgreSQL", async () => {
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
      const expectConstraint = async (
        savepoint: string,
        statement: string,
        values: unknown[],
        code: string,
      ): Promise<void> => {
        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          await expect(client.query(statement, values)).rejects.toMatchObject({ code });
        } finally {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        }
      };

      const firstUser = randomUUID();
      await client.query(
        'INSERT INTO "User" ("id","username","displayName","passwordHash","role","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        [firstUser, "constraint-user", "Constraint User", "hash", "OPERATOR", "ACTIVE"],
      );
      await expectConstraint(
        "duplicate_user",
          'INSERT INTO "User" ("id","username","displayName","passwordHash","role","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
          [randomUUID(), "constraint-user", "Duplicate", "hash", "OPERATOR", "ACTIVE"],
        "23505",
      );

      await client.query(
        'INSERT INTO "Session" ("id","tokenDigest","csrfDigest","userId","lastActivityAt","expiresAt") VALUES ($1,$2,$3,$4,$5,$6)',
        [randomUUID(), "1".repeat(64), "2".repeat(64), firstUser, "2026-12-01T00:00:00Z", "2026-12-01T00:30:00Z"],
      );
      await expectConstraint(
        "duplicate_session_digest",
        'INSERT INTO "Session" ("id","tokenDigest","csrfDigest","userId","lastActivityAt","expiresAt") VALUES ($1,$2,$3,$4,$5,$6)',
        [randomUUID(), "1".repeat(64), "3".repeat(64), firstUser, "2026-12-01T00:00:00Z", "2026-12-01T00:30:00Z"],
        "23505",
      );

      await expectConstraint(
        "invalid_shift",
          'INSERT INTO "ShiftDefinition" ("id","name","startMinute","endMinute","position","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
          [randomUUID(), "Invalid", 1_440, 60, 99],
        "23514",
      );

      await client.query(
        'INSERT INTO "ShiftDefinition" ("id","name","startMinute","endMinute","position","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
        [randomUUID(), "Position One", 60, 120, 98],
      );
      await expectConstraint(
        "duplicate_shift_position",
        'INSERT INTO "ShiftDefinition" ("id","name","startMinute","endMinute","position","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
        [randomUUID(), "Position Two", 120, 180, 98],
        "23505",
      );

      await client.query(
        'INSERT INTO "Tag" ("id","name","position","updatedAt") VALUES ($1,$2,$3,NOW())',
        [randomUUID(), "constraint-tag", 98],
      );
      await expectConstraint(
        "duplicate_tag_name",
        'INSERT INTO "Tag" ("id","name","position","updatedAt") VALUES ($1,$2,$3,NOW())',
        [randomUUID(), "constraint-tag", 99],
        "23505",
      );

      const entryId = randomUUID();
      const postId = randomUUID();
      await expectConstraint(
        "both_parents",
          'INSERT INTO "Attachment" ("id","storageKey","originalName","mimeType","byteSize","sha256","disposition","entryId","tagPostId","uploadedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [randomUUID(), "invalid/both", "bad.txt", "text/plain", 1, "0".repeat(64), "ATTACHMENT", entryId, postId, firstUser],
        "23514",
      );

      await expectConstraint(
        "neither_parent",
          'INSERT INTO "Attachment" ("id","storageKey","originalName","mimeType","byteSize","sha256","disposition","uploadedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), "invalid/neither", "bad.txt", "text/plain", 1, "0".repeat(64), "ATTACHMENT", firstUser],
        "23514",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("retains historical shift ownership through restrictive foreign keys", async () => {
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
      const definitionId = randomUUID();
      const dayId = randomUUID();
      await client.query(
        'INSERT INTO "ShiftDefinition" ("id","name","startMinute","endMinute","position","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
        [definitionId, "Historical", 0, 480, 99],
      );
      await client.query(
        'INSERT INTO "OperationalDay" ("id","operationalDate","boundaryMinute") VALUES ($1,$2,$3)',
        [dayId, "2026-12-01", 0],
      );
      await client.query(
        'INSERT INTO "ShiftInstance" ("id","operationalDayId","definitionId","nameSnapshot","startMinuteSnapshot","endMinuteSnapshot","positionSnapshot","status","openedAt","closedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [randomUUID(), dayId, definitionId, "Historical", 0, 480, 99, "CLOSED", "2026-12-01T00:00:00Z", "2026-12-01T08:00:00Z"],
      );
      await expect(
        client.query('DELETE FROM "ShiftDefinition" WHERE "id" = $1', [definitionId]),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("seeds deterministic development identities without plaintext passwords", async () => {
    const users = await pool.query<{ username: string; passwordHash: string }>(
      'SELECT "username", "passwordHash" FROM "User" ORDER BY "username"',
    );
    expect(users.rows.map((user) => user.username)).toEqual([
      "aisha",
      "daniel",
      "ethan",
      "marcus",
    ]);
    for (const user of users.rows) {
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain("NightyDemo!2026");
    }

    const active = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "ShiftInstance" WHERE "status" = \'ACTIVE\'',
    );
    expect(active.rows[0]?.count).toBe("1");

    const retention = await pool.query<{ value: number }>(
      'SELECT "value" FROM "AppSetting" WHERE "key" = \'retentionDays\'',
    );
    expect(retention.rows[0]?.value).toBe(365);
  });
});
