import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { recoverAbandonedProcesses } from "../src/process-recovery.ts";
import { type ArtifactProducer, Reconciler } from "../src/reconciler.ts";
import { StateStore } from "../src/state-store.ts";
import { withDirectory } from "./support.ts";

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

function delivery(): string {
  return [
    "---",
    "schema: nighty.delivery/v1",
    "task_id: TASK-901",
    "task_revision: 1",
    "attempt: A01",
    "run_id: 7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1",
    "status: DELIVERED",
    "baseline_commit: NOT_INITIALIZED",
    "delivered_commit: UNCOMMITTED",
    "created_by: deepseek",
    "created_at: 2026-11-14T18:00:00+04:00",
    "---",
    "",
    "# Delivery",
    "",
    ...deliverySections.flatMap((section) => ["## " + section, "", "Recorded.", ""]),
  ].join("\n");
}

function prepare(store: StateStore): void {
  store.createTask("TASK-901", 1);
  store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
  store.transition("TASK-901", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "dispatch");
  store.beginAttempt("TASK-901", 1, "A01");
}

async function waitUntil(check: () => boolean, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("condition did not become true");
}

test("ORCH-004 production dispatch renews the live lease heartbeat", async () => {
  await withDirectory("nighty-heartbeat-", async (directory) => {
    const orchestration = path.join(directory, "orchestration");
    const deliveries = path.join(orchestration, "deliveries");
    const reviews = path.join(orchestration, "reviews");
    const quarantine = path.join(orchestration, "quarantine");
    const tasks = path.join(orchestration, "tasks");
    const status = path.join(orchestration, "status");
    for (const target of [deliveries, reviews, quarantine, tasks, status]) mkdirSync(target, { recursive: true });
    writeFileSync(path.join(tasks, "TASK-901.md"), "# Task\n", "utf8");
    const producer: ArtifactProducer = {
      async run(input) {
        input.onProcessStarted?.({
          runId: "provider",
          rootPid: process.pid,
          startedAt: new Date().toISOString(),
          executable: process.execPath,
        });
        await new Promise((resolve) => setTimeout(resolve, 140));
        writeFileSync(input.outputPath, "delivered", "utf8");
        return { process: { exitCode: 0, timedOut: false } };
      },
    };
    const store = new StateStore(path.join(status, "orchestration.db"));
    store.createTask("TASK-901", 1);
    store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    const reconciler = new Reconciler({
      root: directory,
      state: store,
      deliveriesDirectory: deliveries,
      reviewsDirectory: reviews,
      quarantineDirectory: quarantine,
      tasksDirectory: tasks,
      developer: producer,
      developerLeaseMs: 80,
      heartbeatIntervalMs: 20,
    });
    const dispatch = reconciler.dispatchDevelopment("TASK-901");
    await waitUntil(() => store.getLease("TASK-901")?.pid === process.pid);
    const initialHeartbeat = store.getLease("TASK-901")?.heartbeatAt;
    await waitUntil(() => store.getLease("TASK-901")?.heartbeatAt !== initialHeartbeat);
    assert.ok(Date.parse(store.getLease("TASK-901")?.expiresAt ?? "") > Date.now());
    await dispatch;
    assert.equal(store.getRun(store.listRuns("TASK-901")[0]!.runId)?.state, "COMPLETED");
    store.close();
  });
});

test("ORCH-004 abandoned cleanup failure remains visible and retries after restart", async () => {
  await withDirectory("nighty-cleanup-retry-", async (directory) => {
    const database = path.join(directory, "orchestration.db");
    let store = new StateStore(database);
    prepare(store);
    const run = store.beginRun({
      taskId: "TASK-901",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 60_000,
    });
    store.attachOwnedProcess({
      runId: run.runId,
      pid: 4242,
      observedAt: "2026-11-14T20:00:00.000Z",
      executable: process.execPath,
    });
    store.close();

    store = new StateStore(database);
    const first = await recoverAbandonedProcesses({
      state: store,
      cleanup: async () => ({ verified: false, failures: ["injected cleanup failure"] }),
    });
    assert.equal(first[0]?.status, "retry_required");
    assert.equal(store.getRun(run.runId)?.state, "RUNNING");
    assert.equal(store.getTask("TASK-901")?.state, "IN_DEVELOPMENT");
    assert.equal(store.listEvents().some((event) => event.eventType === "CLEANUP_RETRY_REQUIRED"), true);

    const second = await recoverAbandonedProcesses({
      state: store,
      cleanup: async () => ({ verified: true, failures: [] }),
    });
    assert.equal(second[0]?.status, "cleaned");
    assert.equal(store.getRun(run.runId)?.state, "FAILED");
    assert.equal(store.getLease("TASK-901"), undefined);
    assert.equal(store.getTask("TASK-901")?.state, "EXECUTION_FAILED");
    store.close();
  });
});

test("ORCH-004 restart recovery terminates the exact persisted provider process", { skip: process.platform !== "win32" }, async () => {
  await withDirectory("nighty-crash-cleanup-", async (directory) => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: directory,
      stdio: "ignore",
      windowsHide: true,
    });
    assert.ok(child.pid);
    const database = path.join(directory, "orchestration.db");
    let store = new StateStore(database);
    prepare(store);
    const run = store.beginRun({
      taskId: "TASK-901",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 60_000,
    });
    store.attachOwnedProcess({
      runId: run.runId,
      pid: child.pid,
      observedAt: new Date().toISOString(),
      executable: process.execPath,
    });
    store.close();

    store = new StateStore(database);
    const outcomes = await recoverAbandonedProcesses({ state: store });
    assert.equal(outcomes[0]?.status, "cleaned");
    await waitUntil(() => {
      try {
        process.kill(child.pid!, 0);
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(store.getTask("TASK-901")?.state, "EXECUTION_FAILED");
    store.close();
  });
});

test("ORCH-004 output arriving after a timed-out run is quarantined, never accepted", async () => {
  await withDirectory("nighty-late-output-", async (directory) => {
    const orchestration = path.join(directory, "orchestration");
    const deliveries = path.join(orchestration, "deliveries");
    const reviews = path.join(orchestration, "reviews");
    const quarantine = path.join(orchestration, "quarantine");
    const tasks = path.join(orchestration, "tasks");
    const status = path.join(orchestration, "status");
    for (const target of [deliveries, reviews, quarantine, tasks, status]) mkdirSync(target, { recursive: true });
    const store = new StateStore(path.join(status, "orchestration.db"));
    prepare(store);
    const run = store.beginRun({
      taskId: "TASK-901",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: 2222,
      leaseMs: 60_000,
    });
    store.finishRun(run.runId, { state: "TIMED_OUT", exitCode: null, timedOut: true });
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), delivery(), "utf8");
    const reconciler = new Reconciler({
      root: directory,
      state: store,
      deliveriesDirectory: deliveries,
      reviewsDirectory: reviews,
      quarantineDirectory: quarantine,
      tasksDirectory: tasks,
    });
    const result = await reconciler.reconcileOnce();
    assert.equal(result.actions[0]?.kind, "EXECUTION_FAILED");
    assert.equal(store.getTask("TASK-901")?.state, "EXECUTION_FAILED");
    assert.equal(store.getArtifactDigest("TASK-901", 1, "A01", "delivery"), null);
    assert.equal(readdirSync(quarantine).some((name) => name.endsWith(".quarantine")), true);
    store.close();
  });
});
