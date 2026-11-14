import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  loadSchemaFile,
  validateAgainstSchema,
} from "../src/schema.ts";
import { withDirectory } from "./support.ts";

const DELIVERY_SCHEMA = path.resolve(
  import.meta.dirname,
  "..",
  "schemas",
  "delivery.schema.json",
);

const VALID_DELIVERY = {
  schema: "nighty.delivery/v1",
  task_id: "TASK-901",
  task_revision: 1,
  attempt: "A01",
  run_id: "7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1",
  status: "DELIVERED",
  baseline_commit: "NOT_INITIALIZED",
  delivered_commit: "UNCOMMITTED",
  created_by: "deepseek",
  created_at: "2026-11-14T18:00:00+04:00",
};

test("schema validator enforces required, const, pattern, and additional properties", () => {
  const schema = {
    type: "object",
    required: ["id", "state"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^TASK-[0-9]{3}$" },
      state: { enum: ["READY", "DONE"] },
      revision: { type: "integer", minimum: 1 },
    },
  };

  assert.deepEqual(validateAgainstSchema({ id: "TASK-001", state: "READY" }, schema), []);
  assert.ok(
    validateAgainstSchema({ id: "bad", state: "READY", extra: true }, schema).some((error) =>
      error.includes("/id"),
    ),
  );
  assert.ok(
    validateAgainstSchema({ id: "TASK-001", state: "READY", extra: true }, schema).some((error) =>
      error.includes("additional property"),
    ),
  );
});

test("schema validation fails closed on unsupported keywords", () => {
  assert.throws(
    () => validateAgainstSchema({}, { type: "object", patternProperties: {} }),
    /unsupported schema keyword/,
  );
});

test("tightened delivery schema accepts the exact delivery shape", () => {
  const schema = loadSchemaFile(DELIVERY_SCHEMA, { maxBytes: 64 * 1024 });
  assert.deepEqual(validateAgainstSchema(VALID_DELIVERY, schema), []);
});

test("tightened delivery schema rejects unknown fields and malformed identities", () => {
  const schema = loadSchemaFile(DELIVERY_SCHEMA, { maxBytes: 64 * 1024 });

  assert.ok(
    validateAgainstSchema({ ...VALID_DELIVERY, unexpected: true }, schema).length > 0,
  );
  assert.ok(
    validateAgainstSchema({ ...VALID_DELIVERY, attempt: "A1" }, schema).some((error) =>
      error.includes("/attempt"),
    ),
  );
  assert.ok(
    validateAgainstSchema({ ...VALID_DELIVERY, run_id: "not-a-uuid" }, schema).some((error) =>
      error.includes("/run_id"),
    ),
  );
  assert.ok(
    validateAgainstSchema({ ...VALID_DELIVERY, created_at: "yesterday" }, schema).some((error) =>
      error.includes("/created_at"),
    ),
  );
});

test("schema loader bounds the schema file before parsing", async () => {
  await withDirectory("nighty-schema-", async (directory) => {
    const file = path.join(directory, "huge.schema.json");
    writeFileSync(file, JSON.stringify({ type: "object", padding: "x".repeat(4096) }));
    assert.throws(
      () => loadSchemaFile(file, { maxBytes: 1024 }),
      /exceeds the 1024-byte limit/,
    );
  });
});
