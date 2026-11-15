import path from "node:path";

import { assertControlArtifactPath } from "./bounded-io.ts";

export type ValidationResult = { ok: boolean; errors: string[] };
type Artifact = Record<string, unknown> & { sections?: unknown };

const TASK_SECTIONS = [
  "Objective", "Requirement sources", "Dependencies", "In scope", "Out of scope",
  "Implementation instructions", "Expected files/modules",
  "Technical and security restrictions", "Required tests and exact commands",
  "Acceptance criteria", "Required delivery report",
];
const DELIVERY_SECTIONS = [
  "Implementation summary", "Files created", "Files modified", "Requirement mapping",
  "Tests actually executed", "Known issues", "Deviations", "Dependencies",
  "Security notes", "Completion statement",
];
const REVIEW_SECTIONS = [
  "Decision", "Independent inspection", "Requirement-by-requirement findings",
  "Tests independently executed", "Security/architecture review", "Actionable changes",
  "Limitations/unverified coverage", "Next transition",
];

const TASK_ID = /^TASK-[0-9]{3}$/;
const ATTEMPT = /^A[0-9]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const COMMIT = /^[0-9a-f]{7,40}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function sectionsOf(artifact: Artifact): string[] {
  return Array.isArray(artifact.sections)
    ? artifact.sections.filter((section): section is string => typeof section === "string")
    : [];
}

function missingSections(artifact: Artifact, required: string[]): string[] {
  const actual = new Set(sectionsOf(artifact));
  return required
    .filter((section) => !actual.has(section))
    .map((section) => "missing section: " + section);
}

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDateTime(value: unknown): value is string {
  return hasString(value) && DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return value as string[];
}

export function validateTask(task: Artifact): ValidationResult {
  const errors = missingSections(task, TASK_SECTIONS);
  if (task.schema !== "nighty.task/v1") errors.push("invalid task schema");
  if (!hasString(task.task_id) || !TASK_ID.test(task.task_id)) errors.push("invalid task_id");
  if (!Number.isInteger(task.revision) || Number(task.revision) < 1) errors.push("invalid revision");
  if (task.status !== "READY_FOR_DEVELOPMENT") errors.push("task status must be READY_FOR_DEVELOPMENT");
  if (!["P0", "P1", "P2", "P3"].includes(String(task.priority))) errors.push("invalid priority");
  const dependencies = stringArray(task.depends_on);
  if (dependencies === null || !dependencies.every((entry) => TASK_ID.test(entry))) {
    errors.push("invalid task dependencies");
  } else if (new Set(dependencies).size !== dependencies.length) {
    errors.push("task dependencies must be unique");
  }
  const requirements = stringArray(task.requirements);
  if (requirements === null || requirements.length === 0 || requirements.some((entry) => entry.trim().length === 0)) {
    errors.push("invalid task requirements");
  }
  if (task.created_by !== "codex") errors.push("task author must be codex");
  if (!validDateTime(task.created_at)) errors.push("invalid task creation time");
  return { ok: errors.length === 0, errors };
}

export function validateDelivery(
  delivery: Artifact,
  expected: { taskId: string; revision: number; attempt: string },
): ValidationResult {
  const errors = missingSections(delivery, DELIVERY_SECTIONS);
  if (delivery.schema !== "nighty.delivery/v1") errors.push("invalid delivery schema");
  if (delivery.task_id !== expected.taskId) errors.push("task identity mismatch");
  if (delivery.task_revision !== expected.revision) errors.push("task revision mismatch");
  if (delivery.attempt !== expected.attempt) errors.push("attempt identity mismatch");
  if (delivery.created_by !== "deepseek") errors.push("delivery author must be deepseek");
  if (delivery.status !== "DELIVERED") errors.push("delivery status must be DELIVERED");
  if (!hasString(delivery.run_id) || !UUID.test(delivery.run_id)) errors.push("invalid delivery run_id");
  if (!hasString(delivery.attempt) || !ATTEMPT.test(delivery.attempt)) errors.push("invalid delivery attempt");
  if (
    !hasString(delivery.baseline_commit)
    || !(delivery.baseline_commit === "NOT_INITIALIZED" || COMMIT.test(delivery.baseline_commit))
  ) {
    errors.push("invalid baseline commit");
  }
  if (
    !hasString(delivery.delivered_commit)
    || !(delivery.delivered_commit === "UNCOMMITTED" || COMMIT.test(delivery.delivered_commit))
  ) {
    errors.push("invalid delivered commit");
  }
  if (!validDateTime(delivery.created_at)) errors.push("invalid delivery creation time");
  return { ok: errors.length === 0, errors };
}

export function validateReview(
  review: Artifact,
  expected?: {
    taskId: string;
    revision: number;
    attempt: string;
    deliverySha256?: string;
    taskSha256?: string;
  },
): ValidationResult {
  const errors = missingSections(review, REVIEW_SECTIONS);
  if (review.schema !== "nighty.review/v1") errors.push("invalid review schema");
  if (!["APPROVED", "CHANGES_REQUIRED", "BLOCKED"].includes(String(review.decision))) {
    errors.push("invalid review decision");
  }
  if (review.reviewed_by !== "codex") errors.push("review author must be codex");
  if (!hasString(review.task_id) || !TASK_ID.test(review.task_id)) errors.push("invalid review task_id");
  if (!Number.isInteger(review.task_revision) || Number(review.task_revision) < 1) {
    errors.push("invalid review task revision");
  }
  if (!hasString(review.attempt) || !ATTEMPT.test(review.attempt)) errors.push("invalid review attempt");
  if (!hasString(review.run_id) || !UUID.test(review.run_id)) errors.push("invalid review run_id");
  if (!hasString(review.delivery_sha256) || !SHA256.test(review.delivery_sha256)) {
    errors.push("invalid review delivery digest");
  }
  if (!hasString(review.task_sha256) || !SHA256.test(review.task_sha256)) {
    errors.push("invalid review task content digest");
  }
  if (!validDateTime(review.created_at)) errors.push("invalid review creation time");
  if (review.decision === "APPROVED" && review.mandatory_criteria_verified !== true) {
    errors.push("APPROVED requires all mandatory criteria verified");
  }
  if (!hasString(review.baseline_commit) || !COMMIT.test(review.baseline_commit)) {
    errors.push("invalid review baseline commit");
  }
  if (!hasString(review.head_commit) || !COMMIT.test(review.head_commit)) {
    errors.push("invalid review head commit");
  }
  if (!hasString(review.branch)) errors.push("invalid review branch");
  if (!hasString(review.source_sha256) || !SHA256.test(review.source_sha256)) {
    errors.push("invalid review source digest");
  }
  if (!hasString(review.tree_sha256) || !SHA256.test(review.tree_sha256)) {
    errors.push("invalid review tree digest");
  }
  if (expected !== undefined) {
    if (review.task_id !== expected.taskId) errors.push("task identity mismatch");
    if (review.task_revision !== expected.revision) errors.push("task revision mismatch");
    if (review.attempt !== expected.attempt) errors.push("attempt identity mismatch");
    if (
      expected.deliverySha256 !== undefined
      && review.delivery_sha256 !== expected.deliverySha256
    ) {
      errors.push("review delivery digest mismatch");
    }
    if (
      expected.taskSha256 !== undefined
      && review.task_sha256 !== expected.taskSha256
    ) {
      errors.push("task content digest mismatch");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertArtifactPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("artifact path resolves outside orchestration root");
  }
  assertControlArtifactPath(resolved);
  return resolved;
}
