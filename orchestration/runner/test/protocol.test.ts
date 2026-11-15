import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertArtifactPath,
  validateDelivery,
  validateReview,
  validateTask,
} from "../src/protocol.ts";

test("task validation rejects a missing acceptance section", () => {
  const result = validateTask({
    schema: "nighty.task/v1",
    task_id: "TASK-001",
    revision: 1,
    status: "READY_FOR_DEVELOPMENT",
    priority: "P0",
    depends_on: [],
    requirements: ["REQ-001"],
    created_by: "codex",
    created_at: "2026-11-14T00:00:00+04:00",
    sections: [
      "Objective",
      "Requirement sources",
      "Dependencies",
      "In scope",
      "Out of scope",
      "Implementation instructions",
      "Expected files/modules",
      "Technical and security restrictions",
      "Required tests and exact commands",
      "Required delivery report",
    ],
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ["missing section: Acceptance criteria"],
  });
});

test("valid delivery requires matching immutable task and attempt identity", () => {
  const result = validateDelivery({
    schema: "nighty.delivery/v1",
    task_id: "TASK-007",
    task_revision: 2,
    attempt: "A03",
    run_id: "be9a0a84-a9b2-4c39-b428-13e21d2e36e5",
    status: "DELIVERED",
    baseline_commit: "abc1234",
    delivered_commit: "def5678",
    created_by: "deepseek",
    created_at: "2026-11-14T01:00:00+04:00",
    sections: [
      "Implementation summary",
      "Files created",
      "Files modified",
      "Requirement mapping",
      "Tests actually executed",
      "Known issues",
      "Deviations",
      "Dependencies",
      "Security notes",
      "Completion statement",
    ],
  }, { taskId: "TASK-007", revision: 2, attempt: "A03" });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("review approval is invalid when mandatory coverage is unverified", () => {
  const result = validateReview({
    schema: "nighty.review/v1",
    task_id: "TASK-002",
    task_revision: 1,
    attempt: "A01",
    run_id: "d5a65ecb-1f67-4327-92f8-afaf2aa3a53c",
    decision: "APPROVED",
    reviewed_by: "codex",
    created_at: "2026-11-14T01:00:00+04:00",
    delivery_sha256: "a".repeat(64),
    baseline_commit: "b".repeat(40),
    head_commit: "c".repeat(40),
    branch: "main",
    source_sha256: "d".repeat(64),
    tree_sha256: "e".repeat(64),
    task_sha256: "f".repeat(64),
    mandatory_criteria_verified: false,
    sections: [
      "Decision",
      "Independent inspection",
      "Requirement-by-requirement findings",
      "Tests independently executed",
      "Security/architecture review",
      "Actionable changes",
      "Limitations/unverified coverage",
      "Next transition",
    ],
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ["APPROVED requires all mandatory criteria verified"],
  });
});

test("review approval cannot omit repository evidence", () => {
  const result = validateReview({
    schema: "nighty.review/v1",
    task_id: "TASK-002",
    task_revision: 1,
    attempt: "A01",
    run_id: "d5a65ecb-1f67-4327-92f8-afaf2aa3a53c",
    decision: "APPROVED",
    reviewed_by: "codex",
    created_at: "2026-11-14T01:00:00+04:00",
    delivery_sha256: "a".repeat(64),
    task_sha256: "f".repeat(64),
    mandatory_criteria_verified: true,
    sections: [
      "Decision", "Independent inspection", "Requirement-by-requirement findings",
      "Tests independently executed", "Security/architecture review", "Actionable changes",
      "Limitations/unverified coverage", "Next transition",
    ],
  });
  assert.ok(result.errors.includes("invalid review baseline commit"));
  assert.ok(result.errors.includes("invalid review head commit"));
  assert.ok(result.errors.includes("invalid review branch"));
  assert.ok(result.errors.includes("invalid review source digest"));
  assert.ok(result.errors.includes("invalid review tree digest"));
});

test("artifact paths cannot escape the orchestration root", () => {
  assert.throws(
    () => assertArtifactPath("E:\\Nighty\\orchestration", "..\\..\\Windows\\secret.md"),
    /outside orchestration root/,
  );
});

test("artifact paths reject control-artifact reparse points", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-protocol-"));
  try {
    const root = path.join(directory, "orchestration");
    const real = path.join(directory, "real");
    mkdirSync(root);
    mkdirSync(real);
    const ancestor = path.join(root, "tasks");
    symlinkSync(real, ancestor, "junction");

    assert.throws(
      () => assertArtifactPath(root, path.join("tasks", "TASK-901.md")),
      /reparse point|symbolic link/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("task validation rejects invalid priority, dependencies, and requirements", () => {
  const base = {
    schema: "nighty.task/v1",
    task_id: "TASK-901",
    revision: 1,
    status: "READY_FOR_DEVELOPMENT",
    priority: "P0",
    depends_on: [],
    requirements: ["REQ-001"],
    created_by: "codex",
    created_at: "2026-11-14T00:00:00+04:00",
    sections: [
      "Objective",
      "Requirement sources",
      "Dependencies",
      "In scope",
      "Out of scope",
      "Implementation instructions",
      "Expected files/modules",
      "Technical and security restrictions",
      "Required tests and exact commands",
      "Acceptance criteria",
      "Required delivery report",
    ],
  };
  assert.deepEqual(validateTask(base), { ok: true, errors: [] });
  assert.ok(validateTask({ ...base, priority: "URGENT" }).errors.length > 0);
  assert.ok(validateTask({ ...base, depends_on: ["TASK-1"] }).errors.length > 0);
  assert.ok(validateTask({ ...base, requirements: [] }).errors.length > 0);
  assert.ok(validateTask({ ...base, created_at: "yesterday" }).errors.length > 0);
});

test("delivery validation rejects malformed run and attempt identity", () => {
  const delivery = {
    schema: "nighty.delivery/v1",
    task_id: "TASK-007",
    task_revision: 2,
    attempt: "A03",
    run_id: "be9a0a84-a9b2-4c39-b428-13e21d2e36e5",
    status: "DELIVERED",
    baseline_commit: "abc1234",
    delivered_commit: "UNCOMMITTED",
    created_by: "deepseek",
    created_at: "2026-11-14T01:00:00+04:00",
    sections: [
      "Implementation summary",
      "Files created",
      "Files modified",
      "Requirement mapping",
      "Tests actually executed",
      "Known issues",
      "Deviations",
      "Dependencies",
      "Security notes",
      "Completion statement",
    ],
  };
  const expected = { taskId: "TASK-007", revision: 2, attempt: "A03" };
  assert.deepEqual(validateDelivery(delivery, expected), { ok: true, errors: [] });
  assert.ok(validateDelivery({ ...delivery, run_id: "not-a-uuid" }, expected).errors.length > 0);
  assert.ok(validateDelivery({ ...delivery, attempt: "3" }, expected).errors.length > 0);
  assert.ok(validateDelivery({ ...delivery, status: "IN_DEVELOPMENT" }, expected).errors.length > 0);
  assert.ok(validateDelivery({ ...delivery, baseline_commit: "not a commit" }, expected).errors.length > 0);
});

test("review validation binds an optional expected identity and delivery digest", () => {
  const review = {
    schema: "nighty.review/v1",
    task_id: "TASK-002",
    task_revision: 1,
    attempt: "A01",
    run_id: "d5a65ecb-1f67-4327-92f8-afaf2aa3a53c",
    decision: "APPROVED",
    reviewed_by: "codex",
    created_at: "2026-11-14T01:00:00+04:00",
    delivery_sha256: "a".repeat(64),
    baseline_commit: "b".repeat(40),
    head_commit: "c".repeat(40),
    branch: "main",
    source_sha256: "d".repeat(64),
    tree_sha256: "e".repeat(64),
    task_sha256: "f".repeat(64),
    mandatory_criteria_verified: true,
    sections: [
      "Decision",
      "Independent inspection",
      "Requirement-by-requirement findings",
      "Tests independently executed",
      "Security/architecture review",
      "Actionable changes",
      "Limitations/unverified coverage",
      "Next transition",
    ],
  };
  assert.deepEqual(validateReview(review, {
    taskId: "TASK-002",
    revision: 1,
    attempt: "A01",
    deliverySha256: "a".repeat(64),
    taskSha256: "f".repeat(64),
  }), { ok: true, errors: [] });
  assert.ok(validateReview(review, {
    taskId: "TASK-002",
    revision: 1,
    attempt: "A02",
  }).errors.some((error) => error.includes("attempt identity mismatch")));
  assert.ok(validateReview(review, {
    taskId: "TASK-002",
    revision: 1,
    attempt: "A01",
    deliverySha256: "b".repeat(64),
  }).errors.some((error) => error.includes("review delivery digest mismatch")));
  assert.ok(validateReview(review, {
    taskId: "TASK-002",
    revision: 1,
    attempt: "A01",
    taskSha256: "0".repeat(64),
  }).errors.some((error) => error.includes("task content digest mismatch")));
  assert.ok(validateReview({ ...review, task_sha256: "bad" }).errors.length > 0);
  assert.ok(validateReview({ ...review, reviewed_by: "deepseek" }).errors.length > 0);
  assert.ok(validateReview({ ...review, created_at: "not-a-date" }).errors.length > 0);
});
