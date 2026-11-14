import path from "node:path";

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

export function validateTask(task: Artifact): ValidationResult {
  const errors = missingSections(task, TASK_SECTIONS);
  if (task.schema !== "nighty.task/v1") errors.push("invalid task schema");
  if (!hasString(task.task_id) || !/^TASK-\d{3}$/.test(task.task_id)) errors.push("invalid task_id");
  if (!Number.isInteger(task.revision) || Number(task.revision) < 1) errors.push("invalid revision");
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
  return { ok: errors.length === 0, errors };
}

export function validateReview(review: Artifact): ValidationResult {
  const errors = missingSections(review, REVIEW_SECTIONS);
  if (review.schema !== "nighty.review/v1") errors.push("invalid review schema");
  if (!["APPROVED", "CHANGES_REQUIRED", "BLOCKED"].includes(String(review.decision))) {
    errors.push("invalid review decision");
  }
  if (review.decision === "APPROVED" && review.mandatory_criteria_verified !== true) {
    errors.push("APPROVED requires all mandatory criteria verified");
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
  return resolved;
}
