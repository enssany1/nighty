import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createApprovalBinding,
  verifyCheckpointIntegrity,
} from "../src/approval.ts";
import { inspectGit } from "../src/git-gate.ts";
import { runGit, withGitRepository } from "./git-support.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const DELIVERY_SHA = sha256("delivery artifact");
const REVIEW_SHA = sha256("review artifact");
const TASK_SHA = sha256("task content");

test("Git inspection records branch, head, tree, inventory, and source digests", async () => {
  await withGitRepository(async (directory) => {
    const baseline = inspectGit(directory);
    assert.equal(baseline.branch, "main");
    assert.match(baseline.head, /^[0-9a-f]{40}$/);
    assert.match(baseline.headTree, /^[0-9a-f]{40}$/);
    assert.equal(baseline.clean, true);
    assert.deepEqual(baseline.changes, []);
    assert.deepEqual(baseline.inventory, []);
    assert.equal(baseline.inventorySha256, sha256("[]"));

    writeFileSync(path.join(directory, "src.ts"), "export const value = 1;\n");
    const changed = inspectGit(directory);
    assert.equal(changed.clean, false);
    assert.deepEqual(changed.inventory.map((entry) => entry.path), ["src.ts"]);
    assert.match(changed.inventory[0]?.digest ?? "", /^[0-9a-f]{64}$/);
    assert.notEqual(changed.sourceSha256, baseline.sourceSha256);
    assert.notEqual(changed.inventorySha256, baseline.inventorySha256);
  });
});

test("checkpoint verification accepts an unchanged, fully bound approval", async () => {
  await withGitRepository(async (directory) => {
    writeFileSync(path.join(directory, "src.ts"), "export const value = 1;\n");
    const git = inspectGit(directory);
    const approval = createApprovalBinding({
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      decision: "APPROVED",
      baselineCommit: git.head,
      git,
      approvedAt: "2026-11-14T18:00:00+04:00",
    });

    assert.doesNotThrow(() => verifyCheckpointIntegrity({
      approval,
      observed: {
        repoRoot: directory,
        taskId: "TASK-901",
        taskRevision: 1,
        attempt: "A01",
        deliverySha256: DELIVERY_SHA,
        reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
        reviewDecision: "APPROVED",
        git: inspectGit(directory),
      },
    }));
  });
});

test("checkpoint verification rejects source mutation after review", async () => {
  await withGitRepository(async (directory) => {
    const source = path.join(directory, "src.ts");
    writeFileSync(source, "export const value = 1;\n");
    const git = inspectGit(directory);
    const approval = createApprovalBinding({
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      decision: "APPROVED",
      baselineCommit: git.head,
      git,
    });

    writeFileSync(source, "export const value = 2;\n");
    assert.throws(
      () => verifyCheckpointIntegrity({
        approval,
        observed: {
          repoRoot: directory,
          taskId: "TASK-901",
          taskRevision: 1,
          attempt: "A01",
          deliverySha256: DELIVERY_SHA,
          reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
          reviewDecision: "APPROVED",
          git: inspectGit(directory),
        },
      }),
      /source content changed after review|worktree inventory changed after review/,
    );
  });
});

test("checkpoint verification rejects extra or missing worktree inventory", async () => {
  await withGitRepository(async (directory) => {
    writeFileSync(path.join(directory, "src.ts"), "export const value = 1;\n");
    const git = inspectGit(directory);
    const approval = createApprovalBinding({
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      decision: "APPROVED",
      baselineCommit: git.head,
      git,
    });

    writeFileSync(path.join(directory, "unexpected.ts"), "export const extra = true;\n");
    assert.throws(
      () => verifyCheckpointIntegrity({
        approval,
        observed: {
          repoRoot: directory,
          taskId: "TASK-901",
          taskRevision: 1,
          attempt: "A01",
          deliverySha256: DELIVERY_SHA,
          reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
          reviewDecision: "APPROVED",
          git: inspectGit(directory),
        },
      }),
      /worktree inventory changed after review/,
    );
  });
});

test("checkpoint verification rejects branch, head, and baseline changes", async () => {
  await withGitRepository(async (directory) => {
    writeFileSync(path.join(directory, "src.ts"), "export const value = 1;\n");
    const git = inspectGit(directory);
    const approval = createApprovalBinding({
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      decision: "APPROVED",
      baselineCommit: git.head,
      git,
    });

    const observed = () => ({
      repoRoot: directory,
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      reviewDecision: "APPROVED" as const,
      git: inspectGit(directory),
    });

    runGit(directory, ["checkout", "-b", "other-branch"]);
    assert.throws(() => verifyCheckpointIntegrity({ approval, observed: observed() }), /branch changed/);

    runGit(directory, ["checkout", "main"]);
    runGit(directory, ["add", "src.ts"]);
    runGit(directory, ["commit", "-m", "approved work"]);
    assert.throws(() => verifyCheckpointIntegrity({ approval, observed: observed() }), /head changed/);

    const detachedApproval = { ...approval, baseline_commit: "0".repeat(40) };
    assert.throws(
      () => verifyCheckpointIntegrity({ approval: detachedApproval, observed: observed() }),
      /approval digest is invalid|baseline commit is not an ancestor/,
    );
  });
});

test("checkpoint verification rejects identity and digest drift after review", async () => {
  await withGitRepository(async (directory) => {
    const git = inspectGit(directory);
    const approval = createApprovalBinding({
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      decision: "APPROVED",
      baselineCommit: git.head,
      git,
    });
    const base = {
      repoRoot: directory,
      taskId: "TASK-901",
      taskRevision: 1,
      attempt: "A01",
      deliverySha256: DELIVERY_SHA,
      reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
      reviewDecision: "APPROVED" as const,
      git: inspectGit(directory),
    };

    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, attempt: "A02" } }),
      /attempt identity changed after review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, taskRevision: 2 } }),
      /task revision changed after review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, deliverySha256: sha256("other") } }),
      /delivery digest changed after review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, reviewSha256: sha256("other") } }),
      /review digest changed after review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, taskSha256: sha256("mutated task") } }),
      /task content changed after review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({ approval, observed: { ...base, reviewDecision: "CHANGES_REQUIRED" } }),
      /checkpoint requires an APPROVED review/,
    );
    assert.throws(
      () => verifyCheckpointIntegrity({
        approval: { ...approval, approval_sha256: "f".repeat(64) },
        observed: base,
      }),
      /approval digest is invalid/,
    );
  });
});

test("approval binding refuses a non-approving decision", async () => {
  await withGitRepository(async (directory) => {
    const git = inspectGit(directory);
    assert.throws(
      () => createApprovalBinding({
        taskId: "TASK-901",
        taskRevision: 1,
        attempt: "A01",
        deliverySha256: DELIVERY_SHA,
        reviewSha256: REVIEW_SHA,
      taskSha256: TASK_SHA,
        decision: "CHANGES_REQUIRED",
        baselineCommit: git.head,
        git,
      }),
      /approval binding requires APPROVED/,
    );
  });
});

