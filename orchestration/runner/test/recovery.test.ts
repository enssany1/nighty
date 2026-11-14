import assert from "node:assert/strict";
import test from "node:test";

import { decideRecovery } from "../src/recovery.ts";

test("live owned development run remains under observation", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: false,
    ownedProcessAlive: true,
    artifact: null,
  }), { action: "WAIT", reason: "owned process and lease are live" });
});

test("expired run without output becomes execution failure without redispatch", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: null,
  }), { action: "MARK_EXECUTION_FAILED", reason: "lease expired and owned process is absent" });
});

test("completed delivery after runner restart is validated exactly once", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: { digest: "a".repeat(64), recordedDigest: null },
  }), { action: "VALIDATE_DELIVERY", reason: "unrecorded delivery is present" });
});

test("artifact identity conflict stops for human review", () => {
  assert.deepEqual(decideRecovery({
    state: "DELIVERED",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: { digest: "b".repeat(64), recordedDigest: "a".repeat(64) },
  }), { action: "HUMAN_REVIEW", reason: "artifact digest conflicts with recorded identity" });
});

test("reviewer failure preserves delivery and retries review", () => {
  assert.deepEqual(decideRecovery({
    state: "UNDER_REVIEW",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: { digest: "a".repeat(64), recordedDigest: "a".repeat(64) },
  }), { action: "RETRY_REVIEW", reason: "delivery is preserved and reviewer lease expired" });
});

test("a delivery artifact is never validated while its producer is still alive", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: true,
    ownedProcessAlive: true,
    artifact: { digest: "a".repeat(64), recordedDigest: null },
  }), { action: "WAIT", reason: "owned process is still alive after lease expiry" });
});

test("a live descendant blocks validation even when the producer root exited", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: true,
    ownedProcessAlive: false,
    producerDescendantAlive: true,
    artifact: { digest: "a".repeat(64), recordedDigest: null },
  }), { action: "WAIT", reason: "an owned producer descendant is still alive" });
});

test("a delivery recorded before a crash advances without duplicate validation", () => {
  assert.deepEqual(decideRecovery({
    state: "IN_DEVELOPMENT",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: { digest: "a".repeat(64), recordedDigest: "a".repeat(64) },
  }), {
    action: "ADVANCE_DELIVERY",
    reason: "delivery is recorded but state has not advanced",
  });
});

test("human review state never silently releases ownership", () => {
  assert.deepEqual(decideRecovery({
    state: "HUMAN_REVIEW",
    leaseExpired: true,
    ownedProcessAlive: false,
    artifact: { digest: "a".repeat(64), recordedDigest: "a".repeat(64) },
  }), { action: "WAIT", reason: "task is waiting for human review" });
});

test("exhausted corrections require human direction instead of another run", () => {
  assert.deepEqual(decideRecovery({
    state: "CHANGES_REQUIRED",
    leaseExpired: true,
    ownedProcessAlive: false,
    correctionsExhausted: true,
    artifact: { digest: "a".repeat(64), recordedDigest: "a".repeat(64) },
  }), { action: "HUMAN_REVIEW", reason: "correction attempts exhausted" });
});
