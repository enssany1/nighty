import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ForegroundRunner } from "../src/foreground-runner.ts";
import { GitCheckpoint } from "../src/git-checkpoint.ts";
import { inspectGit } from "../src/git-gate.ts";
import { type ArtifactProducer, Reconciler } from "../src/reconciler.ts";
import { openExistingStateStore, StateStore } from "../src/state-store.ts";
import { runGit } from "./git-support.ts";

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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function delivery(attempt: string, baseline: string): string {
  return [
    "---", "schema: nighty.delivery/v1", "task_id: TASK-901", "task_revision: 1",
    "attempt: " + attempt, "run_id: " + randomUUID(), "status: DELIVERED",
    "baseline_commit: " + baseline, "delivered_commit: UNCOMMITTED",
    "created_by: deepseek", "created_at: " + new Date().toISOString(), "---", "",
    ...DELIVERY_SECTIONS.flatMap((section) => ["## " + section, "", "Recorded by pilot.", ""]),
  ].join("\n");
}

function review(input: {
  attempt: string;
  decision: "APPROVED" | "CHANGES_REQUIRED";
  deliverySha: string;
  taskSha: string;
  root: string;
}): string {
  const git = inspectGit(input.root);
  return [
    "---", "schema: nighty.review/v1", "task_id: TASK-901", "task_revision: 1",
    "attempt: " + input.attempt, "run_id: " + randomUUID(),
    "decision: " + input.decision, "reviewed_by: codex",
    "created_at: " + new Date().toISOString(), "delivery_sha256: " + input.deliverySha,
    "baseline_commit: " + git.head, "head_commit: " + git.head, "branch: " + git.branch,
    "source_sha256: " + git.sourceSha256, "tree_sha256: " + git.inventorySha256,
    "task_sha256: " + input.taskSha,
    "mandatory_criteria_verified: " + String(input.decision === "APPROVED"), "---", "",
    ...REVIEW_SECTIONS.flatMap((section) => ["## " + section, "", "Pilot evidence recorded.", ""]),
  ].join("\n");
}

async function eventually(assertion: () => void, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try { assertion(); return; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw last;
}

test("ORCH-010 foreground pilot completes one correction, checkpoint, and restart", async () => {
  const root = await import("node:fs").then(({ mkdtempSync }) =>
    mkdtempSync(path.join(tmpdir(), "nighty-pilot-")),
  );
  const orchestration = path.join(root, "orchestration");
  const deliveries = path.join(orchestration, "deliveries");
  const reviews = path.join(orchestration, "reviews");
  const quarantine = path.join(orchestration, "quarantine");
  const tasks = path.join(orchestration, "tasks");
  const status = path.join(orchestration, "status");
  for (const directory of [deliveries, reviews, quarantine, tasks, status]) {
    mkdirSync(directory, { recursive: true });
  }
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.name", "Nighty Pilot"]);
  runGit(root, ["config", "user.email", "nighty-pilot@localhost"]);
  writeFileSync(path.join(root, "README.md"), "pilot baseline\n");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-m", "chore: pilot baseline"]);
  const task = "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nCreate sample.ts.\n";
  writeFileSync(path.join(tasks, "TASK-901.md"), task);
  const database = path.join(status, "orchestration.db");
  let store = new StateStore(database);
  store.createTask("TASK-901", 1);
  store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "pilot ready");

  const developer: ArtifactProducer = {
    async run(input) {
      input.onProcessStarted?.({
        runId: "pilot-developer", rootPid: process.pid, startedAt: new Date().toISOString(),
      });
      writeFileSync(
        path.join(root, "sample.ts"),
        input.attempt === "A01" ? "export const sample = 1;\n" : "export const sample = 2;\n",
      );
      writeFileSync(input.outputPath, delivery(input.attempt, inspectGit(root).head));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  let reviewCount = 0;
  const reviewer: ArtifactProducer = {
    async run(input) {
      reviewCount += 1;
      input.onProcessStarted?.({
        runId: "pilot-reviewer-" + reviewCount,
        rootPid: process.pid,
        startedAt: new Date().toISOString(),
      });
      const deliveryPath = path.join(deliveries, "TASK-901-" + input.attempt + "-DELIVERY.md");
      writeFileSync(input.outputPath, review({
        attempt: input.attempt,
        decision: reviewCount === 1 ? "CHANGES_REQUIRED" : "APPROVED",
        deliverySha: sha256(readFileSync(deliveryPath)),
        taskSha: sha256(task),
        root,
      }));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  const createReconciler = (authority: StateStore) => new Reconciler({
    root, state: authority, deliveriesDirectory: deliveries, reviewsDirectory: reviews,
    quarantineDirectory: quarantine, tasksDirectory: tasks, developer, reviewer,
    gitCheckpoint: new GitCheckpoint({ root }),
  });
  let reconciler = createReconciler(store);
  let runner = new ForegroundRunner({
    lockPath: path.join(status, "runner.lock"),
    watchDirectories: [deliveries, reviews],
    pollIntervalMs: 80,
    reconcile: async () => { await reconciler.reconcileOnce(); },
  });
  try {
    await runner.start();
    await reconciler.dispatchDevelopment("TASK-901");
    runner.wake();
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "DELIVERED"));
    await reconciler.dispatchReview("TASK-901");
    runner.wake();
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "CHANGES_REQUIRED"));

    assert.equal(reconciler.prepareCorrection("TASK-901").attempt, "A02");
    await reconciler.dispatchDevelopment("TASK-901");
    runner.wake();
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "DELIVERED"));
    await reconciler.dispatchReview("TASK-901");
    runner.wake();
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "APPROVED"));

    const checkpoint = reconciler.checkpoint("TASK-901");
    assert.match(checkpoint.commit ?? "", /^[0-9a-f]{40}$/);
    assert.equal(readFileSync(path.join(root, "sample.ts"), "utf8"), "export const sample = 2;\n");
    assert.equal(runGit(root, ["log", "-1", "--pretty=%s"]), "feat(task-901): checkpoint approved changes");
    assert.equal(store.listRuns("TASK-901").length, 4);

    await runner.stop();
    store.close();
    store = openExistingStateStore(database);
    reconciler = createReconciler(store);
    runner = new ForegroundRunner({
      lockPath: path.join(status, "runner.lock"), watchDirectories: [deliveries, reviews],
      pollIntervalMs: 80, reconcile: async () => { await reconciler.reconcileOnce(); },
    });
    await runner.start();
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "CHECKPOINTED"));
    assert.equal(runGit(root, ["rev-list", "--count", "HEAD"]), "2");
  } finally {
    await runner.stop().catch(() => undefined);
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
