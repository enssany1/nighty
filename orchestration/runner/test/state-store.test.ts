import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { StateStore } from "../src/state-store.ts";

function withStore(run: (store: StateStore) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-state-"));
  const store = new StateStore(path.join(directory, "orchestration.db"));
  try {
    run(store);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("state transitions require the recorded expected state", () => {
  withStore((store) => {
    store.createTask("TASK-001", 1);
    store.transition("TASK-001", "PLANNED", "READY_FOR_DEVELOPMENT", "approved dependency set");

    assert.throws(
      () => store.transition("TASK-001", "PLANNED", "IN_DEVELOPMENT", "stale caller"),
      /expected PLANNED but found READY_FOR_DEVELOPMENT/,
    );
    assert.equal(store.getTask("TASK-001")?.state, "READY_FOR_DEVELOPMENT");
  });
});

test("only one task can own an active workflow state", () => {
  withStore((store) => {
    for (const id of ["TASK-001", "TASK-002"]) {
      store.createTask(id, 1);
      store.transition(id, "PLANNED", "READY_FOR_DEVELOPMENT", "ready");
    }
    store.transition("TASK-001", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "run-1");

    assert.throws(
      () => store.transition("TASK-002", "READY_FOR_DEVELOPMENT", "IN_DEVELOPMENT", "run-2"),
      /active task TASK-001 already owns the workflow/,
    );
  });
});

test("duplicate artifact events are idempotent but conflicting digests stop", () => {
  withStore((store) => {
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

test("each transition appends an immutable event", () => {
  withStore((store) => {
    store.createTask("TASK-009", 3);
    store.transition("TASK-009", "PLANNED", "READY_FOR_DEVELOPMENT", "dependencies approved");

    assert.deepEqual(
      store.listEvents().map(({ eventType, fromState, toState }) => ({ eventType, fromState, toState })),
      [
        { eventType: "TASK_CREATED", fromState: null, toState: "PLANNED" },
        { eventType: "STATE_TRANSITION", fromState: "PLANNED", toState: "READY_FOR_DEVELOPMENT" },
      ],
    );
  });
});
