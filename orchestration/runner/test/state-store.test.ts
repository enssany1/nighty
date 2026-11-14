import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { StateStore } from "../src/state-store.ts";
import { SecretRedactor } from "../src/redaction.ts";

function withStore(run: (store: StateStore) => void | Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-state-"));
  const store = new StateStore(path.join(directory, "orchestration.db"));
  return Promise.resolve(run(store)).finally(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
}

function toReady(store: StateStore, taskId: string, revision = 1): void {
  store.createTask(taskId, revision);
  store.transition(taskId, "PLANNED", "READY_FOR_DEVELOPMENT", "approved dependency set");
}

function toInDevelopment(store: StateStore, taskId: string, revision = 1): void {
  toReady(store, taskId, revision);
  store.transition(taskId, "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "dispatch", {
    expectedRevision: revision,
  });
}

test("state transitions require the recorded expected state", async () => {
  await withStore((store) => {
    toReady(store, "TASK-001");

    assert.throws(
      () => store.transition("TASK-001", "PLANNED", "IN_DEVELOPMENT", "stale caller"),
      /expected PLANNED but found READY_FOR_DEVELOPMENT/,
    );
    assert.equal(store.getTask("TASK-001")?.state, "READY_FOR_DEVELOPMENT");
  });
});

test("transitions bind the expected task revision identity", async () => {
  await withStore((store) => {
    toReady(store, "TASK-001", 2);

    assert.throws(
      () => store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "stale", {
        expectedRevision: 1,
      }),
      /task revision mismatch: expected 1 but found 2/,
    );
    store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "current", {
      expectedRevision: 2,
    });
    assert.equal(store.getTask("TASK-001")?.revision, 2);
    assert.equal(store.getTask("TASK-001")?.state, "IN_DEVELOPMENT");
  });
});

test("only one task can own an active workflow state", async () => {
  await withStore((store) => {
    for (const id of ["TASK-001", "TASK-002"]) toReady(store, id);
    store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "run-1");

    assert.throws(
      () => store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "run-2"),
      /active task TASK-001 already owns the workflow/,
    );
  });
});

test("ownership remains active through APPROVED and CHECKPOINTED until explicitly released", async () => {
  await withStore((store) => {
    toReady(store, "TASK-001");
    toReady(store, "TASK-002");
    store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "run-1");
    store.transition("TASK-001", "IN_DEVELOPMENT", "DELIVERED", "delivery recorded");
    store.transition("TASK-001", "DELIVERED", "UNDER_REVIEW", "review started");
    store.transition("TASK-001", "UNDER_REVIEW", "APPROVED", "review approved");

    assert.equal(store.getTask("TASK-001")?.active, true);
    assert.throws(
      () => store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "too early"),
      /active task TASK-001 already owns the workflow/,
    );

    store.transition("TASK-001", "APPROVED", "CHECKPOINTED", "checkpoint created");
    assert.equal(store.getTask("TASK-001")?.active, true, "checkpoint must not silently release ownership");
    assert.throws(
      () => store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "too early"),
      /active task TASK-001 already owns the workflow/,
    );

    store.releaseOwnership("TASK-001", "CHECKPOINTED", "checkpoint verified");
    assert.equal(store.getTask("TASK-001")?.active, false);
    store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "now eligible");
    assert.equal(store.getTask("TASK-002")?.active, true);
  });
});

test("HUMAN_REVIEW keeps ownership instead of releasing it silently", async () => {
  await withStore((store) => {
    toInDevelopment(store, "TASK-001");
    toReady(store, "TASK-002");
    store.transition("TASK-001", "IN_DEVELOPMENT", "HUMAN_REVIEW", "conflicting source change");

    assert.equal(store.getTask("TASK-001")?.state, "HUMAN_REVIEW");
    assert.equal(store.getTask("TASK-001")?.active, true);
    assert.throws(
      () => store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "blocked by review"),
      /active task TASK-001 already owns the workflow/,
    );
  });
});

test("task revision identity can advance only through an explicit revision event", async () => {
  await withStore((store) => {
    toInDevelopment(store, "TASK-001");
    store.transition("TASK-001", "IN_DEVELOPMENT", "HUMAN_REVIEW", "needs a new revision");

    assert.throws(
      () => store.reviseTask("TASK-001", 2, 3, "stale revision"),
      /task revision mismatch: expected 2 but found 1/,
    );
    store.reviseTask("TASK-001", 1, 2, "requirements clarified");
    assert.equal(store.getTask("TASK-001")?.revision, 2);
    assert.equal(store.getTask("TASK-001")?.active, true);

    store.transition("TASK-001", "HUMAN_REVIEW", "READY_FOR_CORRECTION", "revision approved", {
      expectedRevision: 2,
    });
    assert.equal(store.getTask("TASK-001")?.state, "READY_FOR_CORRECTION");
  });
});

test("duplicate artifact events are idempotent but conflicting digests stop", async () => {
  await withStore((store) => {
    store.createTask("TASK-001", 1);
    assert.equal(store.recordArtifact("TASK-001", "A01", "delivery", "a".repeat(64)), "recorded");
    assert.equal(store.recordArtifact("TASK-001", "A01", "delivery", "a".repeat(64)), "duplicate");
    assert.throws(
      () => store.recordArtifact("TASK-001", "A01", "delivery", "b".repeat(64)),
      /conflicting artifact digest/,
    );
    assert.equal(store.listEvents().length, 2);
  });
});

test("each transition appends an immutable event with revision identity", async () => {
  await withStore((store) => {
    store.createTask("TASK-009", 3);
    store.transition("TASK-009", "PLANNED", "READY_FOR_DEVELOPMENT", "dependencies approved");

    assert.deepEqual(
      store.listEvents().map(({ eventType, fromState, toState }) => ({ eventType, fromState, toState })),
      [
        { eventType: "TASK_CREATED", fromState: null, toState: "PLANNED" },
        { eventType: "STATE_TRANSITION", fromState: "PLANNED", toState: "READY_FOR_DEVELOPMENT" },
      ],
    );
    assert.deepEqual(
      store.listEvents().map((event) => event.revision),
      [3, 3],
    );
  });
});

test("attempts, runs, and one live lease are represented transactionally", async () => {
  await withStore((store) => {
    toInDevelopment(store, "TASK-001", 4);

    assert.equal(store.beginAttempt("TASK-001", 4, "A01"), "created");
    assert.equal(store.beginAttempt("TASK-001", 4, "A01"), "existing");

    const run = store.beginRun({
      taskId: "TASK-001",
      revision: 4,
      attempt: "A01",
      role: "developer",
      pid: 4321,
      leaseMs: 60_000,
    });
    assert.match(run.runId, /^[0-9a-f-]{36}$/);
    assert.equal(run.state, "RUNNING");
    assert.equal(run.pid, 4321);

    const lease = store.getLease("TASK-001");
    assert.equal(lease?.runId, run.runId);
    assert.equal(lease?.expired, false);

    assert.throws(
      () => store.beginRun({
        taskId: "TASK-001",
        revision: 4,
        attempt: "A01",
        role: "developer",
        pid: 4322,
        leaseMs: 60_000,
      }),
      /live lease already owned by run/,
    );

    store.finishRun(run.runId, { state: "COMPLETED", exitCode: 0, timedOut: false });
    assert.equal(store.getRun(run.runId)?.state, "COMPLETED");
    assert.equal(store.getLease("TASK-001"), undefined);

    const rerun = store.beginRun({
      taskId: "TASK-001",
      revision: 4,
      attempt: "A01",
      role: "reviewer",
      pid: null,
      leaseMs: 60_000,
    });
    assert.equal(store.getLease("TASK-001")?.runId, rerun.runId);
  });
});

test("an expired lease can be superseded without duplicating the run", async () => {
  await withStore(async (store) => {
    toInDevelopment(store, "TASK-001");
    store.beginAttempt("TASK-001", 1, "A01");
    const first = store.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(store.getLease("TASK-001")?.expired, true);

    const second = store.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 60_000,
    });
    assert.notEqual(second.runId, first.runId);
    assert.equal(store.getLease("TASK-001")?.runId, second.runId);
    assert.equal(store.getRun(first.runId)?.state, "SUPERSEDED");
  });
});

test("concurrent owners cannot both acquire the same task lease", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-state-"));
  const first = new StateStore(path.join(directory, "orchestration.db"));
  const second = new StateStore(path.join(directory, "orchestration.db"));
  try {
    toInDevelopment(first, "TASK-001");
    first.beginAttempt("TASK-001", 1, "A01");

    first.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: 111,
      leaseMs: 60_000,
    });
    assert.throws(
      () => second.beginRun({
        taskId: "TASK-001",
        revision: 1,
        attempt: "A01",
        role: "developer",
        pid: 222,
        leaseMs: 60_000,
      }),
      /live lease already owned by run/,
    );
  } finally {
    first.close();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("concurrent duplicate artifact records settle on one digest without a second event", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-state-"));
  const first = new StateStore(path.join(directory, "orchestration.db"));
  const second = new StateStore(path.join(directory, "orchestration.db"));
  try {
    first.createTask("TASK-001", 1);
    const digest = "c".repeat(64);
    const outcomes = [
      first.recordArtifact("TASK-001", "A01", "delivery", digest),
      second.recordArtifact("TASK-001", "A01", "delivery", digest),
    ].sort();
    assert.deepEqual(outcomes, ["duplicate", "recorded"]);
    assert.equal(
      first.listEvents().filter((event) => event.eventType === "ARTIFACT_RECORDED").length,
      1,
    );
    assert.throws(
      () => second.recordArtifact("TASK-001", "A01", "delivery", "d".repeat(64)),
      /conflicting artifact digest/,
    );
  } finally {
    first.close();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("provider root ownership is persisted transactionally on the run and live lease", async () => {
  await withStore((store) => {
    toInDevelopment(store, "TASK-001");
    store.beginAttempt("TASK-001", 1, "A01");
    const run = store.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 60_000,
    });

    store.attachOwnedProcess({ runId: run.runId, pid: 4321 });
    assert.equal(store.getRun(run.runId)?.pid, 4321);
    assert.equal(store.getLease("TASK-001")?.pid, 4321);
    assert.equal(store.listEvents().some((event) => event.eventType === "OWNED_PROCESS_ATTACHED"), true);

    assert.throws(
      () => store.attachOwnedProcess({ runId: run.runId, pid: 9999 }),
      /already owns provider process/,
    );
    store.finishRun(run.runId, { state: "COMPLETED", exitCode: 0, timedOut: false });
    assert.throws(
      () => store.attachOwnedProcess({ runId: run.runId, pid: 4321 }),
      /is not running/,
    );
  });
});

test("provider ownership recording fails closed without a live lease", async () => {
  await withStore((store) => {
    toInDevelopment(store, "TASK-001");
    store.beginAttempt("TASK-001", 1, "A01");
    const run = store.beginRun({
      taskId: "TASK-001",
      revision: 1,
      attempt: "A01",
      role: "developer",
      pid: null,
      leaseMs: 60_000,
    });
    store.finishRun(run.runId, { state: "COMPLETED", exitCode: 0, timedOut: false });

    assert.throws(
      () => store.attachOwnedProcess({ runId: run.runId, pid: 4321 }),
      /is not running/,
    );
    assert.equal(store.getRun(run.runId)?.pid, null);
  });
});

test("state events redact the explicit credential value before persistence", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-state-"));
  const secret = "test-only-credential-4a8b2c9d1e7f3a506b4d";
  const store = new StateStore(path.join(directory, "orchestration.db"), {
    redactor: new SecretRedactor([secret]),
  });
  try {
    store.createTask("TASK-001", 1);
    store.transition(
      "TASK-001",
      "PLANNED",
      "READY_FOR_DEVELOPMENT",
      "dependency check failed with " + secret,
    );
    const serialized = JSON.stringify(store.listEvents());
    assert.equal(serialized.includes(secret), false);
    assert.match(serialized, /\[REDACTED\]/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
