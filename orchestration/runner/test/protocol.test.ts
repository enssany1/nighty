import assert from "node:assert/strict";
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

test("artifact paths cannot escape the orchestration root", () => {
  assert.throws(
    () => assertArtifactPath("E:\\Nighty\\orchestration", "..\\..\\Windows\\secret.md"),
    /outside orchestration root/,
  );
});
