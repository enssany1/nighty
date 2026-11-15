import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CodexAdapter } from "../src/codex-adapter.ts";
import {
  type ArtifactProducer,
  type ReconcilerOptions,
  Reconciler,
} from "../src/reconciler.ts";
import { runGit } from "./git-support.ts";
import { StateStore } from "../src/state-store.ts";
import { VerificationRegistry } from "../src/verification-registry.ts";

const DELIVERY_SECTIONS = [
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

const REVIEW_SECTIONS = [
  "Decision",
  "Independent inspection",
  "Requirement-by-requirement findings",
  "Tests independently executed",
  "Security/architecture review",
  "Actionable changes",
  "Limitations/unverified coverage",
  "Next transition",
];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function deliveryMarkdown(input: {
  taskId?: string;
  revision?: number;
  attempt?: string;
  status?: string;
} = {}): string {
  return [
    "---",
    "schema: nighty.delivery/v1",
    "task_id: " + (input.taskId ?? "TASK-901"),
    "task_revision: " + (input.revision ?? 1),
    "attempt: " + (input.attempt ?? "A01"),
    "run_id: 7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1",
    "status: " + (input.status ?? "DELIVERED"),
    "baseline_commit: NOT_INITIALIZED",
    "delivered_commit: UNCOMMITTED",
    "created_by: deepseek",
    "created_at: 2026-11-14T18:00:00+04:00",
    "---",
    "",
    "# Delivery",
    "",
    ...DELIVERY_SECTIONS.flatMap((section) => ["## " + section, "", "Recorded.", ""]),
  ].join("\n");
}

function reviewMarkdown(input: {
  decision?: string;
  deliverySha: string;
  attempt?: string;
  mandatory?: boolean;
  baseline?: string;
  head?: string;
  branch?: string;
  sourceSha?: string;
  treeSha?: string;
  taskSha?: string;
}): string {
  return [
    "---",
    "schema: nighty.review/v1",
    "task_id: TASK-901",
    "task_revision: 1",
    "attempt: " + (input.attempt ?? "A01"),
    "run_id: d5a65ecb-1f67-4327-92f8-afaf2aa3a53c",
    "decision: " + (input.decision ?? "APPROVED"),
    "reviewed_by: codex",
    "created_at: 2026-11-14T18:10:00+04:00",
    "delivery_sha256: " + input.deliverySha,
    "baseline_commit: " + (input.baseline ?? "b".repeat(40)),
    "head_commit: " + (input.head ?? "c".repeat(40)),
    "branch: " + (input.branch ?? "main"),
    "source_sha256: " + (input.sourceSha ?? "d".repeat(64)),
    "tree_sha256: " + (input.treeSha ?? "e".repeat(64)),
    "task_sha256: " + (input.taskSha ?? "f".repeat(64)),
    "mandatory_criteria_verified: " + (input.mandatory ?? true),
    "---",
    "",
    "# Review",
    "",
    ...REVIEW_SECTIONS.flatMap((section) => ["## " + section, "", "Checked.", ""]),
  ].join("\n");
}

type Harness = {
  directory: string;
  store: StateStore;
  reconciler: Reconciler;
  deliveries: string;
  reviews: string;
  quarantine: string;
};

async function withHarness(
  run: (harness: Harness) => Promise<void>,
  overrides: Partial<ReconcilerOptions> = {},
): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-reconcile-"));
  const orchestration = path.join(directory, "orchestration");
  const deliveries = path.join(orchestration, "deliveries");
  const reviews = path.join(orchestration, "reviews");
  const quarantine = path.join(orchestration, "quarantine");
  const tasks = path.join(orchestration, "tasks");
  for (const target of [deliveries, reviews, quarantine, tasks, path.join(orchestration, "status")]) {
    mkdirSync(target, { recursive: true });
  }
  const store = new StateStore(path.join(orchestration, "status", "orchestration.db"));
  const reconciler = new Reconciler({
    root: directory,
    state: store,
    deliveriesDirectory: deliveries,
    reviewsDirectory: reviews,
    quarantineDirectory: quarantine,
    tasksDirectory: tasks,
    maxArtifactBytes: 64 * 1024,
    maxTaskBytes: 64 * 1024,
    ...overrides,
  });
  try {
    await run({ directory, store, reconciler, deliveries, reviews, quarantine });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function toInDevelopment(store: StateStore): void {
  store.createTask("TASK-901", 1);
  store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
  store.transition("TASK-901", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "dispatch");
}

function artifactCount(store: StateStore): number {
  return store.listEvents().filter((event) => event.eventType === "ARTIFACT_RECORDED").length;
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("process did not exit: " + pid);
}

test("reconciler records a delivery renamed before its database record exactly once", async () => {
  await withHarness(async ({ reconciler, store, deliveries }) => {
    toInDevelopment(store);
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), deliveryMarkdown());

    const first = await reconciler.reconcileOnce();
    assert.deepEqual(first.actions.map((action) => action.kind), ["DELIVERY_RECORDED"]);
    assert.equal(store.getTask("TASK-901")?.state, "DELIVERED");
    assert.equal(artifactCount(store), 1);

    const second = await reconciler.reconcileOnce();
    assert.deepEqual(second.actions.map((action) => action.kind), ["DELIVERY_DUPLICATE"]);
    assert.equal(store.getTask("TASK-901")?.state, "DELIVERED");
    assert.equal(artifactCount(store), 1);
  });
});

test("reconciler advances a recorded delivery left behind by a state crash", async () => {
  await withHarness(async ({ reconciler, store, deliveries }) => {
    toInDevelopment(store);
    const contents = deliveryMarkdown();
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), contents);
    store.recordArtifact("TASK-901", "A01", "delivery", sha256(contents));

    const result = await reconciler.reconcileOnce();
    assert.deepEqual(result.actions.map((action) => action.kind), ["DELIVERY_RECORDED"]);
    assert.equal(store.getTask("TASK-901")?.state, "DELIVERED");
    assert.equal(artifactCount(store), 1);
  });
});

test("reconciler waits while the owned producer is alive and validates after it exits", async () => {
  await withHarness(async ({ reconciler, store, deliveries }) => {
    toInDevelopment(store);
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore", windowsHide: true },
    );
    try {
      assert.ok(child.pid);
      store.beginAttempt("TASK-901", 1, "A01");
      store.beginRun({
        taskId: "TASK-901",
        revision: 1,
        attempt: "A01",
        role: "developer",
        pid: child.pid,
        leaseMs: 60_000,
      });
      writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), deliveryMarkdown());

      const waiting = await reconciler.reconcileOnce();
      assert.deepEqual(waiting.actions.map((action) => action.kind), ["WAIT"]);
      assert.equal(store.getTask("TASK-901")?.state, "IN_DEVELOPMENT");
      assert.equal(artifactCount(store), 0);

      child.kill();
      await waitForExit(child.pid);

      const validated = await reconciler.reconcileOnce();
      assert.deepEqual(validated.actions.map((action) => action.kind), ["DELIVERY_RECORDED"]);
      assert.equal(store.getTask("TASK-901")?.state, "DELIVERED");
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });
});

test("reconciler quarantines a conflicting delivery and keeps ownership in HUMAN_REVIEW", async () => {
  await withHarness(async ({ reconciler, store, deliveries, quarantine }) => {
    toInDevelopment(store);
    store.recordArtifact("TASK-901", "A01", "delivery", "a".repeat(64));
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), deliveryMarkdown());

    const result = await reconciler.reconcileOnce();
    assert.deepEqual(result.actions.map((action) => action.kind), ["CONFLICT_QUARANTINED"]);
    assert.equal(store.getTask("TASK-901")?.state, "HUMAN_REVIEW");
    assert.equal(store.getTask("TASK-901")?.active, true);
    assert.deepEqual(
      readdirSync(deliveries),
      [],
    );
    const quarantined = readdirSync(quarantine);
    assert.ok(quarantined.some((name) => name.endsWith(".quarantine")));
    assert.ok(quarantined.some((name) => name.endsWith(".quarantine.json")));
  });
});

test("reconciler rejects an invalid UTF-8 delivery into INVALID_REPORT", async () => {
  await withHarness(async ({ reconciler, store, deliveries, quarantine }) => {
    toInDevelopment(store);
    writeFileSync(
      path.join(deliveries, "TASK-901-A01-DELIVERY.md"),
      Buffer.from([0x2d, 0xff, 0xfe, 0x0a]),
    );

    const result = await reconciler.reconcileOnce();
    assert.deepEqual(result.actions.map((action) => action.kind), ["DELIVERY_INVALID"]);
    assert.equal(store.getTask("TASK-901")?.state, "INVALID_REPORT");
    assert.ok(readdirSync(quarantine).length >= 1);
  });
});

test("reconciler ingests an APPROVED review exactly once and preserves ownership", async () => {
  await withHarness(async ({ reconciler, store, deliveries, reviews, directory }) => {
    toInDevelopment(store);
    const taskContent = "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n";
    writeFileSync(
      path.join(directory, "orchestration", "tasks", "TASK-901.md"),
      taskContent,
    );
    const contents = deliveryMarkdown();
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), contents);
    store.recordArtifact("TASK-901", "A01", "delivery", sha256(contents));
    store.transition("TASK-901", "IN_DEVELOPMENT", "DELIVERED", "delivery recorded");
    store.transition("TASK-901", "DELIVERED", "UNDER_REVIEW", "review started");
    const artifactsBefore = artifactCount(store);

    writeFileSync(
      path.join(reviews, "TASK-901-A01-REVIEW.md"),
      reviewMarkdown({ deliverySha: sha256(contents), taskSha: sha256(taskContent) }),
    );

    const result = await reconciler.reconcileOnce();
    assert.deepEqual(result.actions.map((action) => action.kind), ["REVIEW_RECORDED"]);
    assert.equal(store.getTask("TASK-901")?.state, "APPROVED");
    assert.equal(store.getTask("TASK-901")?.active, true);

    const second = await reconciler.reconcileOnce();
    assert.deepEqual(second.actions.map((action) => action.kind), ["WAIT"]);
    assert.equal(artifactCount(store), artifactsBefore + 1);
  });
});

test("reconciler records provider process ownership from the producer start callback", async () => {
  const producer: ArtifactProducer = {
    async run(input) {
      assert.equal(typeof input.onProcessStarted, "function");
      input.onProcessStarted?.({
        runId: "producer-run",
        rootPid: 54_321,
        startedAt: new Date().toISOString(),
      });
      writeFileSync(input.outputPath, deliveryMarkdown({ attempt: input.attempt }));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  await withHarness(async ({ reconciler, store, directory }) => {
    store.createTask("TASK-901", 1);
    store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    writeFileSync(
      path.join(directory, "orchestration", "tasks", "TASK-901.md"),
      "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n",
    );

    await reconciler.dispatchDevelopment("TASK-901");
    assert.equal(store.listRuns("TASK-901")[0]?.pid, 54_321);
    assert.equal(
      store.listEvents().some((event) => event.eventType === "OWNED_PROCESS_ATTACHED"),
      true,
    );
  }, { developer: producer });
});

test("reconciler fails closed when a producer does not record process ownership", async () => {
  const producer: ArtifactProducer = {
    async run(input) {
      writeFileSync(input.outputPath, deliveryMarkdown({ attempt: input.attempt }));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  await withHarness(async ({ reconciler, store, directory }) => {
    store.createTask("TASK-901", 1);
    store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    writeFileSync(
      path.join(directory, "orchestration", "tasks", "TASK-901.md"),
      "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n",
    );

    await assert.rejects(
      reconciler.dispatchDevelopment("TASK-901"),
      /did not record provider process ownership/,
    );
    assert.equal(store.getTask("TASK-901")?.state, "EXECUTION_FAILED");
    assert.equal(store.listRuns("TASK-901")[0]?.state, "FAILED");
  }, { developer: producer });
});

test("reconciler persists the real provider run and lease PID before provider completion", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-real-adapter-"));
  const orchestration = path.join(directory, "orchestration");
  const deliveries = path.join(orchestration, "deliveries");
  const reviews = path.join(orchestration, "reviews");
  const quarantine = path.join(orchestration, "quarantine");
  const tasks = path.join(orchestration, "tasks");
  const schemas = path.join(orchestration, "runner", "schemas");
  for (const target of [deliveries, reviews, quarantine, tasks, schemas, path.join(orchestration, "status")]) {
    mkdirSync(target, { recursive: true });
  }
  const providerPidFile = path.join(directory, "provider.pid");
  const releaseFile = path.join(directory, "release-provider");
  const outputPath = path.join(deliveries, "TASK-901-A01-DELIVERY.md");
  const fakeCli = path.join(directory, "fake-codex.mjs");
  writeFileSync(
    fakeCli,
    [
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const pidFile = " + JSON.stringify(providerPidFile) + ";",
      "const releaseFile = " + JSON.stringify(releaseFile) + ";",
      "const outputPath = args[args.indexOf('-o') + 1];",
      "fs.writeFileSync(pidFile, String(process.pid));",
      "const timer = setInterval(() => {",
      "  if (!fs.existsSync(releaseFile)) return;",
      "  clearInterval(timer);",
      "  fs.writeFileSync(outputPath, JSON.stringify({ ok: true }));",
      "  process.exit(0);",
      "}, 20);",
    ].join("\n"),
  );
  writeFileSync(
    path.join(schemas, "delivery.schema.json"),
    JSON.stringify({
      type: "object",
      required: ["ok"],
      additionalProperties: false,
      properties: { ok: { const: true } },
    }),
  );
  writeFileSync(
    path.join(tasks, "TASK-901.md"),
    "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n",
  );
  const store = new StateStore(path.join(orchestration, "status", "orchestration.db"));
  const adapter = new CodexAdapter({
    executable: process.execPath,
    baseArgs: [fakeCli],
    projectRoot: directory,
    environment: {},
    timeoutMs: 10_000,
    maxOutputBytes: 4_096,
  });
  const reconciler = new Reconciler({
    root: directory,
    state: store,
    deliveriesDirectory: deliveries,
    reviewsDirectory: reviews,
    quarantineDirectory: quarantine,
    tasksDirectory: tasks,
    schemasDirectory: schemas,
    developer: adapter,
  });
  store.createTask("TASK-901", 1);
  store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
  const dispatch = reconciler.dispatchDevelopment("TASK-901");
  try {
    const deadline = Date.now() + 5_000;
    let ownedPid: number | null = null;
    let leasePid: number | null = null;
    while (Date.now() < deadline) {
      const run = store.listRuns("TASK-901")[0];
      if (run?.pid !== null && run?.pid !== undefined) {
        ownedPid = run.pid;
        leasePid = store.getLease("TASK-901")?.pid ?? null;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(ownedPid !== null && ownedPid > 0, "provider run PID must be persisted while the adapter is running");
    assert.equal(leasePid, ownedPid, "the live lease must carry the same provider PID");
    assert.equal(existsSync(outputPath), false, "ownership must be recorded before provider work completes");
    assert.equal(existsSync(releaseFile), false, "provider must still be blocked when ownership is observed");

    const pidDeadline = Date.now() + 2_000;
    while (!existsSync(providerPidFile) && Date.now() < pidDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const providerPid = Number(readFileSync(providerPidFile, "utf8"));
    assert.equal(ownedPid, providerPid, "the recorded PID must be the actual spawned provider root");

    writeFileSync(releaseFile, "release");
    const outcome = await dispatch;
    assert.equal(outcome.kind, "WAIT");
    assert.equal(store.listRuns("TASK-901")[0]?.state, "COMPLETED");
    assert.equal(store.getLease("TASK-901"), undefined);
    assert.equal(existsSync(outputPath), true);
  } finally {
    writeFileSync(releaseFile, "release");
    await dispatch.catch(() => undefined);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reconciler composes a development producer behind stable state and lease identity", async () => {
  const producer: ArtifactProducer = {
    async run(input) {
      input.onProcessStarted?.({
        runId: "producer-run",
        rootPid: process.pid,
        startedAt: new Date().toISOString(),
      });
      writeFileSync(input.outputPath, deliveryMarkdown({ attempt: input.attempt }));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  await withHarness(async ({ reconciler, store, directory, deliveries }) => {
    store.createTask("TASK-901", 1);
    store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    writeFileSync(
      path.join(directory, "orchestration", "tasks", "TASK-901.md"),
      "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n",
    );

    const dispatch = await reconciler.dispatchDevelopment("TASK-901");
    assert.equal(dispatch.kind, "WAIT");
    assert.equal(store.getTask("TASK-901")?.state, "IN_DEVELOPMENT");
    assert.equal(store.listRuns("TASK-901").length, 1);
    assert.equal(store.listRuns("TASK-901")[0]?.state, "COMPLETED");
    assert.equal(store.getLease("TASK-901"), undefined);
    assert.ok(readdirSync(deliveries).includes("TASK-901-A01-DELIVERY.md"));

    const reconciled = await reconciler.reconcileOnce();
    assert.deepEqual(reconciled.actions.map((action) => action.kind), ["DELIVERY_RECORDED"]);
    assert.equal(store.getTask("TASK-901")?.state, "DELIVERED");
  }, { developer: producer });
});

test("reconciler composes a reviewer producer and preserves the delivery", async () => {
  const delivery = deliveryMarkdown();
  const taskContent = "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n";
  let capturedPrompt = "";
  const producer: ArtifactProducer = {
    async run(input) {
      capturedPrompt = input.prompt;
      input.onProcessStarted?.({
        runId: "producer-run",
        rootPid: process.pid,
        startedAt: new Date().toISOString(),
      });
      writeFileSync(input.outputPath, reviewMarkdown({
        deliverySha: sha256(delivery),
        attempt: input.attempt,
        taskSha: sha256(taskContent),
      }));
      return { process: { exitCode: 0, timedOut: false } };
    },
  };
  await withHarness(async ({ reconciler, store, directory, deliveries }) => {
    toInDevelopment(store);
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), delivery);
    store.recordArtifact("TASK-901", "A01", "delivery", sha256(delivery));
    store.beginAttempt("TASK-901", 1, "A01");
    store.transition("TASK-901", "IN_DEVELOPMENT", "DELIVERED", "delivery recorded");
    writeFileSync(
      path.join(directory, "orchestration", "tasks", "TASK-901.md"),
      taskContent,
    );

    const dispatch = await reconciler.dispatchReview("TASK-901");
    assert.equal(dispatch.kind, "WAIT");
    assert.match(capturedPrompt, new RegExp("task_sha256: " + sha256(taskContent)));
    assert.match(capturedPrompt, /head_commit: c{40}/);
    assert.match(capturedPrompt, /source_sha256: d{64}/);
    assert.equal(store.getTask("TASK-901")?.state, "UNDER_REVIEW");
    const review = await reconciler.reconcileOnce();
    assert.deepEqual(review.actions.map((action) => action.kind), ["REVIEW_RECORDED"]);
    assert.equal(store.getTask("TASK-901")?.state, "APPROVED");
    assert.equal(store.getTask("TASK-901")?.active, true);
  }, {
    reviewer: producer,
    inspectSource: () => ({
      branch: "main",
      head: "c".repeat(40),
      headTree: "0".repeat(40),
      clean: false,
      changes: ["?? src.ts"],
      inventory: [],
      inventorySha256: "e".repeat(64),
      sourceSha256: "d".repeat(64),
    }),
  });
});

function initRepository(directory: string): void {
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Nighty Test"]);
  runGit(directory, ["config", "user.email", "nighty-test@localhost"]);
  writeFileSync(path.join(directory, "README.md"), "baseline\n");
  runGit(directory, ["add", "README.md"]);
  runGit(directory, ["commit", "-m", "baseline"]);
}

async function approveForCheckpoint(harness: Harness): Promise<void> {
  initRepository(harness.directory);
  writeFileSync(path.join(harness.directory, "src.ts"), "export const value = 1;\n");
  const taskContent = "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n";
  writeFileSync(
    path.join(harness.directory, "orchestration", "tasks", "TASK-901.md"),
    taskContent,
  );
  toInDevelopment(harness.store);
  const delivery = deliveryMarkdown();
  writeFileSync(path.join(harness.deliveries, "TASK-901-A01-DELIVERY.md"), delivery);
  harness.store.recordArtifact("TASK-901", "A01", "delivery", sha256(delivery));
  harness.store.transition("TASK-901", "IN_DEVELOPMENT", "DELIVERED", "delivery recorded");
  harness.store.transition("TASK-901", "DELIVERED", "UNDER_REVIEW", "review started");
  const git = harness.reconciler.inspectSource();
  writeFileSync(
    path.join(harness.reviews, "TASK-901-A01-REVIEW.md"),
    reviewMarkdown({
      deliverySha: sha256(delivery),
      baseline: git.head,
      head: git.head,
      branch: git.branch,
      sourceSha: git.sourceSha256,
      treeSha: git.inventorySha256,
      taskSha: sha256(taskContent),
    }),
  );
  const result = await harness.reconciler.reconcileOnce();
  assert.deepEqual(result.actions.map((action) => action.kind), ["REVIEW_RECORDED"]);
  assert.equal(harness.store.getTask("TASK-901")?.state, "APPROVED");
}

test("checkpoint applies the approval integrity gate immediately before CHECKPOINTED", async () => {
  await withHarness(async (harness) => {
    await approveForCheckpoint(harness);

    const action = harness.reconciler.checkpoint("TASK-901");
    assert.equal(action.kind, "CHECKPOINTED");
    assert.match(action.digest ?? "", /^[0-9a-f]{64}$/);
    assert.equal(harness.store.getTask("TASK-901")?.state, "CHECKPOINTED");
    assert.equal(harness.store.getTask("TASK-901")?.active, true);
  });
});

test("checkpoint refuses source or inventory mutations made after review", async () => {
  await withHarness(async (harness) => {
    await approveForCheckpoint(harness);

    writeFileSync(path.join(harness.directory, "src.ts"), "export const value = 2;\n");
    assert.throws(
      () => harness.reconciler.checkpoint("TASK-901"),
      /source content changed after review|worktree inventory changed after review/,
    );
    assert.equal(harness.store.getTask("TASK-901")?.state, "APPROVED");
  });

  await withHarness(async (harness) => {
    await approveForCheckpoint(harness);
    writeFileSync(path.join(harness.directory, "unexpected.ts"), "export const extra = true;\n");
    assert.throws(
      () => harness.reconciler.checkpoint("TASK-901"),
      /source content changed after review|worktree inventory changed after review/,
    );
  });
});

test("checkpoint refuses task content mutated after review", async () => {
  await withHarness(async (harness) => {
    await approveForCheckpoint(harness);
    writeFileSync(
      path.join(harness.directory, "orchestration", "tasks", "TASK-901.md"),
      "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nChanged after review.\n",
    );
    assert.throws(
      () => harness.reconciler.checkpoint("TASK-901"),
      /task content changed after review|task content digest mismatch/,
    );
    assert.equal(harness.store.getTask("TASK-901")?.state, "APPROVED");
  });
});

test("reconciler verification does not inherit the full ambient environment", async () => {
  process.env.NIGHTY_TASK901_AMBIENT_SECRET = "must-not-leak";
  try {
    const registry = new VerificationRegistry();
    registry.register("echo-environment", {
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.env.NIGHTY_TASK901_AMBIENT_SECRET ?? 'absent')"],
      timeoutMs: 2_000,
      maxOutputBytes: 1024,
    });
    await withHarness(async ({ reconciler }) => {
      const result = await reconciler.runVerification("echo-environment");
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "absent");
    }, { verification: registry });
  } finally {
    delete process.env.NIGHTY_TASK901_AMBIENT_SECRET;
  }
});

test("reconciler bounds task prompt reads and rejects reparse points", async () => {
  await withHarness(async ({ reconciler, directory }) => {
    const tasksDirectory = path.join(directory, "orchestration", "tasks");
    const valid = path.join(tasksDirectory, "TASK-901.md");
    writeFileSync(valid, "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n");
    assert.match(reconciler.readTaskPrompt("TASK-901"), /Bounded\./);

    writeFileSync(path.join(tasksDirectory, "TASK-902.md"), "x".repeat(70_000));
    assert.throws(
      () => reconciler.readTaskPrompt("TASK-902"),
      /exceeds the 65536-byte limit|exceeds the 65536-byte/,
    );

    writeFileSync(
      path.join(tasksDirectory, "TASK-903.md"),
      Buffer.from([0x2d, 0xff, 0x2d]),
    );
    assert.throws(() => reconciler.readTaskPrompt("TASK-903"), /not valid UTF-8/);

    const realTasks = path.join(directory, "orchestration", "tasks-real");
    mkdirSync(realTasks);
    writeFileSync(path.join(realTasks, "TASK-901.md"), "---\nschema: nighty.task/v1\n---\n\n## Objective\n\nBounded.\n");
    rmSync(tasksDirectory, { recursive: true, force: true });
    symlinkSync(realTasks, tasksDirectory, "junction");
    assert.throws(
      () => reconciler.readTaskPrompt("TASK-901"),
      /reparse point|symbolic link/i,
    );
  });
});

