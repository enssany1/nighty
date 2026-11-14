import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  materializeProtocolFixtures,
  validateProtocolFixtures,
} from "../src/protocol-fixtures.ts";
import { writeStateProjections } from "../src/projections.ts";
import { StateStore } from "../src/state-store.ts";
import { withDirectory } from "./support.ts";

test("ORCH-001 protocol fixture matrix is deterministic and never overwrites an existing file", async () => {
  await withDirectory("nighty-protocol-fixtures-", (directory) => {
    const first = materializeProtocolFixtures(directory);
    assert.equal(first.created.length, 10);
    assert.deepEqual(first.existing, []);

    const validation = validateProtocolFixtures(directory);
    assert.equal(validation.length, 9);
    assert.equal(validation.every((entry) => entry.passed), true);
    assert.deepEqual(materializeProtocolFixtures(directory), {
      created: [],
      existing: first.created,
    });

    const protectedPath = path.join(directory, "valid-task.json");
    writeFileSync(protectedPath, "owner content", "utf8");
    assert.throws(
      () => materializeProtocolFixtures(directory),
      /refusing to overwrite existing fixture: valid-task\.json/,
    );
    assert.equal(readFileSync(protectedPath, "utf8"), "owner content");
  });
});

test("ORCH-002 SQLite restart preserves authority and projections regenerate without driving state", async () => {
  await withDirectory("nighty-projections-", (directory) => {
    const databasePath = path.join(directory, "orchestration.db");
    const jsonPath = path.join(directory, "TASK_STATUS.json");
    const markdownPath = path.join(directory, "PROJECT_STATUS.md");
    let store = new StateStore(databasePath);
    store.createTask("TASK-001", 1);
    store.createTask("TASK-002", 2);
    store.transition("TASK-001", "PLANNED", "READY_FOR_DEVELOPMENT", "eligible");
    store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "dispatch");
    store.beginAttempt("TASK-001", 1, "A01");
    const run = store.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: 4242,
      leaseMs: 60_000,
    });

    const eventCount = store.listEvents().length;
    writeStateProjections({
      state: store,
      jsonPath,
      markdownPath,
      generatedAt: "2026-11-14T20:00:00.000Z",
    });
    assert.equal(store.listEvents().length, eventCount, "projection writes must not mutate authority");
    store.close();

    store = new StateStore(databasePath);
    assert.deepEqual(store.getActiveTask(), {
      taskId: "TASK-001",
      revision: 1,
      state: "IN_DEVELOPMENT",
      active: true,
    });
    assert.equal(store.getLease("TASK-001")?.runId, run.runId);
    assert.equal(store.listTasks().length, 2);

    rmSync(jsonPath);
    rmSync(markdownPath);
    writeStateProjections({
      state: store,
      jsonPath,
      markdownPath,
      generatedAt: "2026-11-14T20:01:00.000Z",
    });
    const projection = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    assert.equal(projection.projectState, "IN_DEVELOPMENT");
    assert.equal(projection.activeTaskId, "TASK-001");
    assert.match(readFileSync(markdownPath, "utf8"), /TASK-001[\s\S]*IN_DEVELOPMENT/);
    assert.equal(store.getTask("TASK-001")?.state, "IN_DEVELOPMENT");
    store.close();
  });
});
