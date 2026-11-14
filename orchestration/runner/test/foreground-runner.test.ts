import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { discoverArtifacts } from "../src/artifact-inbox.ts";
import { ForegroundRunner } from "../src/foreground-runner.ts";
import { Reconciler } from "../src/reconciler.ts";
import { StateStore } from "../src/state-store.ts";
import { withDirectory } from "./support.ts";

const sections = [
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
    ...sections.flatMap((section) => ["## " + section, "", "Recorded.", ""]),
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function eventually(assertion: () => void, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let failure: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw failure;
}

test("ORCH-003 foreground runner watches atomic publication and performs full polling", async () => {
  await withDirectory("nighty-foreground-", async (directory) => {
    const inbox = path.join(directory, "inbox");
    const lockPath = path.join(directory, "runner.lock");
    mkdirSync(inbox);
    const observations: string[][] = [];
    const runner = new ForegroundRunner({
      lockPath,
      watchDirectories: [inbox],
      pollIntervalMs: 80,
      reconcile: async () => {
        observations.push(discoverArtifacts(inbox));
      },
    });
    await runner.start();
    await eventually(() => assert.ok(observations.length >= 1));
    assert.equal(existsSync(lockPath), true);

    const partial = path.join(inbox, ".TASK-001-A01-DELIVERY.md.partial.tmp");
    writeFileSync(partial, "partial", "utf8");
    const afterPartial = observations.length;
    await eventually(() => assert.ok(observations.length > afterPartial));
    assert.deepEqual(observations.at(-1), []);

    const finalPath = path.join(inbox, "TASK-001-A01-DELIVERY.md");
    renameSync(partial, finalPath);
    await eventually(() => assert.deepEqual(observations.at(-1), [path.basename(finalPath)]));

    const beforePoll = observations.length;
    await eventually(() => assert.ok(observations.length > beforePoll), 1_000);
    await runner.stop();
    assert.equal(existsSync(lockPath), false);
  });
});

test("ORCH-003 foreground runner enforces one owner and quarantines a conflict end to end", async () => {
  await withDirectory("nighty-foreground-conflict-", async (directory) => {
    const orchestration = path.join(directory, "orchestration");
    const deliveries = path.join(orchestration, "deliveries");
    const reviews = path.join(orchestration, "reviews");
    const quarantine = path.join(orchestration, "quarantine");
    const tasks = path.join(orchestration, "tasks");
    const status = path.join(orchestration, "status");
    for (const target of [deliveries, reviews, quarantine, tasks, status]) {
      mkdirSync(target, { recursive: true });
    }
    const store = new StateStore(path.join(status, "orchestration.db"));
    store.createTask("TASK-901", 1);
    store.transition("TASK-901", "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    store.transition("TASK-901", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "dispatch");
    const contents = delivery();
    store.recordArtifact("TASK-901", "A01", "delivery", sha256(contents + "conflict"));
    writeFileSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md"), contents, "utf8");
    const reconciler = new Reconciler({
      root: directory,
      state: store,
      deliveriesDirectory: deliveries,
      reviewsDirectory: reviews,
      quarantineDirectory: quarantine,
      tasksDirectory: tasks,
    });
    const lockPath = path.join(status, "runner.lock");
    const first = new ForegroundRunner({
      lockPath,
      watchDirectories: [deliveries, reviews],
      pollIntervalMs: 100,
      reconcile: async () => {
        await reconciler.reconcileOnce();
      },
    });
    const second = new ForegroundRunner({
      lockPath,
      watchDirectories: [deliveries, reviews],
      pollIntervalMs: 100,
      reconcile: async () => undefined,
    });
    await first.start();
    await assert.rejects(second.start(), /runner lock is already owned/);
    await eventually(() => assert.equal(store.getTask("TASK-901")?.state, "HUMAN_REVIEW"));
    assert.equal(readdirSync(quarantine).some((name) => name.endsWith(".quarantine")), true);
    assert.equal(existsSync(path.join(deliveries, "TASK-901-A01-DELIVERY.md")), false);
    await first.stop();
    store.close();
  });
});
