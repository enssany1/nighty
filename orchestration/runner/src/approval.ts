import { createHash } from "node:crypto";

import {
  canonicalJson,
  isAncestor,
  type GitInspection,
  type GitInventoryEntry,
} from "./git-gate.ts";

export type ApprovalBinding = {
  schema: "nighty.approval/v1";
  task_id: string;
  task_revision: number;
  attempt: string;
  decision: "APPROVED";
  delivery_sha256: string;
  review_sha256: string;
  task_sha256: string;
  baseline_commit: string;
  head_commit: string;
  head_tree: string;
  branch: string;
  source_sha256: string;
  inventory_sha256: string;
  inventory: GitInventoryEntry[];
  approved_at: string;
  approval_sha256: string;
};

type CreateApprovalInput = {
  taskId: string;
  taskRevision: number;
  attempt: string;
  deliverySha256: string;
  reviewSha256: string;
  taskSha256: string;
  decision: "APPROVED" | "CHANGES_REQUIRED" | "BLOCKED";
  baselineCommit: string;
  git: GitInspection;
  approvedAt?: string;
};

type ObservedCheckpoint = {
  repoRoot: string;
  taskId: string;
  taskRevision: number;
  attempt: string;
  deliverySha256: string;
  reviewSha256: string;
  taskSha256: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUIRED" | "BLOCKED";
  git: GitInspection;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertDigest(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(label + " must be a SHA-256 digest");
  }
}

export function computeApprovalDigest(
  binding: Omit<ApprovalBinding, "approval_sha256">,
): string {
  return sha256(canonicalJson(binding));
}

export function createApprovalBinding(input: CreateApprovalInput): ApprovalBinding {
  if (input.decision !== "APPROVED") {
    throw new Error("approval binding requires APPROVED review");
  }
  if (!/^TASK-[0-9]{3}$/.test(input.taskId)) throw new Error("invalid task identity");
  if (!Number.isInteger(input.taskRevision) || input.taskRevision < 1) {
    throw new Error("invalid task revision");
  }
  if (!/^A[0-9]{2}$/.test(input.attempt)) throw new Error("invalid attempt identity");
  assertDigest(input.deliverySha256, "delivery digest");
  assertDigest(input.reviewSha256, "review digest");
  assertDigest(input.taskSha256, "task content digest");
  if (input.baselineCommit.trim().length === 0) throw new Error("baseline commit is required");

  const base = {
    schema: "nighty.approval/v1" as const,
    task_id: input.taskId,
    task_revision: input.taskRevision,
    attempt: input.attempt,
    decision: "APPROVED" as const,
    delivery_sha256: input.deliverySha256,
    review_sha256: input.reviewSha256,
    task_sha256: input.taskSha256,
    baseline_commit: input.baselineCommit,
    head_commit: input.git.head,
    head_tree: input.git.headTree,
    branch: input.git.branch,
    source_sha256: input.git.sourceSha256,
    inventory_sha256: input.git.inventorySha256,
    inventory: input.git.inventory.map((entry) => ({ ...entry })),
    approved_at: input.approvedAt ?? new Date().toISOString(),
  };
  return { ...base, approval_sha256: computeApprovalDigest(base) };
}

export function verifyCheckpointIntegrity(input: {
  approval: ApprovalBinding;
  observed: ObservedCheckpoint;
}): void {
  const { approval, observed } = input;
  if (approval.schema !== "nighty.approval/v1") {
    throw new Error("unsupported approval binding schema");
  }
  if (approval.decision !== "APPROVED" || observed.reviewDecision !== "APPROVED") {
    throw new Error("checkpoint requires an APPROVED review");
  }
  if (approval.task_id !== observed.taskId) {
    throw new Error("task identity changed after review");
  }
  if (approval.task_revision !== observed.taskRevision) {
    throw new Error("task revision changed after review");
  }
  if (approval.attempt !== observed.attempt) {
    throw new Error("attempt identity changed after review");
  }
  if (approval.delivery_sha256 !== observed.deliverySha256) {
    throw new Error("delivery digest changed after review");
  }
  if (approval.review_sha256 !== observed.reviewSha256) {
    throw new Error("review digest changed after review");
  }
  if (approval.task_sha256 !== observed.taskSha256) {
    throw new Error("task content changed after review");
  }

  const { approval_sha256: declaredDigest, ...base } = approval;
  if (computeApprovalDigest(base) !== declaredDigest) {
    throw new Error("approval digest is invalid");
  }

  const git = observed.git;
  if (approval.branch !== git.branch) {
    throw new Error("branch changed after review");
  }
  if (approval.head_commit !== git.head) {
    throw new Error("head changed after review");
  }
  if (approval.head_tree !== git.headTree) {
    throw new Error("head tree changed after review");
  }
  if (
    approval.inventory_sha256 !== git.inventorySha256 ||
    canonicalJson(approval.inventory) !== canonicalJson(git.inventory)
  ) {
    throw new Error("worktree inventory changed after review");
  }
  if (approval.source_sha256 !== git.sourceSha256) {
    throw new Error("source content changed after review");
  }
  if (!isAncestor(observed.repoRoot, approval.baseline_commit, git.head)) {
    throw new Error("baseline commit is not an ancestor of head");
  }
}
