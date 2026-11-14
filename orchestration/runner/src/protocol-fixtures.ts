import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { BoundedReadError, readBoundedJsonFile, readBoundedUtf8File } from "./bounded-io.ts";
import {
  assertArtifactPath,
  validateDelivery,
  validateReview,
  validateTask,
} from "./protocol.ts";

type FixtureDefinition = { name: string; contents: string };

export type FixtureValidation = {
  name: string;
  passed: boolean;
  detail: string;
};

const taskSections = [
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
];

const deliverySections = [
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
];

const reviewSections = [
  "Decision",
  "Independent inspection",
  "Requirement-by-requirement findings",
  "Tests independently executed",
  "Security/architecture review",
  "Actionable changes",
  "Limitations/unverified coverage",
  "Next transition",
];

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

const validTask = {
  schema: "nighty.task/v1",
  task_id: "TASK-001",
  revision: 1,
  status: "READY_FOR_DEVELOPMENT",
  priority: "P0",
  depends_on: [],
  requirements: ["REQ-001"],
  created_by: "codex",
  created_at: "2026-11-14T00:00:00+04:00",
  sections: taskSections,
};

const validDelivery = {
  schema: "nighty.delivery/v1",
  task_id: "TASK-001",
  task_revision: 1,
  attempt: "A01",
  run_id: "be9a0a84-a9b2-4c39-b428-13e21d2e36e5",
  status: "DELIVERED",
  baseline_commit: "abc1234",
  delivered_commit: "UNCOMMITTED",
  created_by: "deepseek",
  created_at: "2026-11-14T01:00:00+04:00",
  sections: deliverySections,
};

const taskDigest = "a".repeat(64);
const deliveryDigest = "b".repeat(64);
const validReview = {
  schema: "nighty.review/v1",
  task_id: "TASK-001",
  task_revision: 1,
  attempt: "A01",
  run_id: "d5a65ecb-1f67-4327-92f8-afaf2aa3a53c",
  decision: "APPROVED",
  reviewed_by: "codex",
  created_at: "2026-11-14T02:00:00+04:00",
  delivery_sha256: deliveryDigest,
  task_sha256: taskDigest,
  mandatory_criteria_verified: true,
  baseline_commit: "abc1234",
  head_commit: "def5678",
  branch: "codex/disposable",
  source_sha256: "c".repeat(64),
  tree_sha256: "d".repeat(64),
  sections: reviewSections,
};

const fixtures: FixtureDefinition[] = [
  { name: "valid-task.json", contents: json(validTask) },
  { name: "invalid-task.json", contents: json({ ...validTask, sections: taskSections.slice(0, -2) }) },
  { name: "valid-delivery.json", contents: json(validDelivery) },
  { name: "invalid-delivery.json", contents: json({ ...validDelivery, created_by: "unknown" }) },
  { name: "valid-review.json", contents: json(validReview) },
  { name: "invalid-review.json", contents: json({ ...validReview, mandatory_criteria_verified: false }) },
  { name: "traversal.json", contents: json({ candidate: "../outside.md" }) },
  { name: "oversized.txt", contents: "x".repeat(2_048) },
  { name: "duplicate-delivery-a.json", contents: json(validDelivery) },
  {
    name: "duplicate-delivery-b.json",
    contents: json({ ...validDelivery, created_at: "2026-11-14T01:01:00+04:00" }),
  },
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function materializeProtocolFixtures(directory: string): {
  created: string[];
  existing: string[];
} {
  mkdirSync(directory, { recursive: true });
  const created: string[] = [];
  const existing: string[] = [];
  for (const fixture of fixtures) {
    const destination = path.join(directory, fixture.name);
    if (existsSync(destination)) {
      if (readFileSync(destination, "utf8") !== fixture.contents) {
        throw new Error("refusing to overwrite existing fixture: " + fixture.name);
      }
      existing.push(fixture.name);
      continue;
    }
    writeFileSync(destination, fixture.contents, { encoding: "utf8", flag: "wx" });
    created.push(fixture.name);
  }
  return { created, existing };
}

function parsed(directory: string, name: string): Record<string, unknown> {
  return readBoundedJsonFile(path.join(directory, name), {
    maxBytes: 128 * 1024,
    rejectControlArtifacts: true,
    requireObject: true,
  }) as Record<string, unknown>;
}

export function validateProtocolFixtures(directory: string): FixtureValidation[] {
  const results: FixtureValidation[] = [];
  const check = (name: string, passed: boolean, detail: string): void => {
    results.push({ name, passed, detail });
  };

  check("valid task", validateTask(parsed(directory, "valid-task.json")).ok, "task accepted");
  check("invalid task", !validateTask(parsed(directory, "invalid-task.json")).ok, "task rejected");
  check(
    "valid delivery",
    validateDelivery(parsed(directory, "valid-delivery.json"), {
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
    }).ok,
    "delivery accepted",
  );
  check(
    "invalid delivery",
    !validateDelivery(parsed(directory, "invalid-delivery.json"), {
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
    }).ok,
    "delivery rejected",
  );
  check("valid review", validateReview(parsed(directory, "valid-review.json")).ok, "review accepted");
  check("invalid review", !validateReview(parsed(directory, "invalid-review.json")).ok, "review rejected");

  const traversal = parsed(directory, "traversal.json");
  let traversalRejected = false;
  try {
    assertArtifactPath(directory, String(traversal.candidate));
  } catch {
    traversalRejected = true;
  }
  check("traversal", traversalRejected, "path escaped fixture root and was rejected");

  let oversizedRejected = false;
  try {
    readBoundedUtf8File(path.join(directory, "oversized.txt"), {
      maxBytes: 1_024,
      rejectControlArtifacts: true,
    });
  } catch (error) {
    oversizedRejected = error instanceof BoundedReadError && error.code === "too_large";
  }
  check("oversized artifact", oversizedRejected, "pre-allocation size bound enforced");

  const duplicateA = readFileSync(path.join(directory, "duplicate-delivery-a.json"), "utf8");
  const duplicateB = readFileSync(path.join(directory, "duplicate-delivery-b.json"), "utf8");
  const duplicateIdentity = parsed(directory, "duplicate-delivery-a.json");
  const conflictingIdentity = parsed(directory, "duplicate-delivery-b.json");
  check(
    "duplicate identity conflict",
    duplicateIdentity.task_id === conflictingIdentity.task_id
      && duplicateIdentity.attempt === conflictingIdentity.attempt
      && sha256(duplicateA) !== sha256(duplicateB),
    "same identity has a different digest and must conflict",
  );
  return results;
}
