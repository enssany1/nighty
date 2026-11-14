import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { assertCheckpointAllowed, inspectGit } from "../src/git-gate.ts";

function withRepository(run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-git-"));
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Nighty Test"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "nighty-test@localhost"], { cwd: directory });
    writeFileSync(path.join(directory, "README.md"), "baseline");
    execFileSync("git", ["add", "README.md"], { cwd: directory });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: directory });
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Git inspection records branch head and clean baseline", () => {
  withRepository((directory) => {
    const result = inspectGit(directory);
    assert.equal(result.branch, "main");
    assert.match(result.head, /^[0-9a-f]{40}$/);
    assert.equal(result.clean, true);
    assert.deepEqual(result.changes, []);
  });
});

test("Git inspection exposes conflicting source mutations", () => {
  withRepository((directory) => {
    writeFileSync(path.join(directory, "README.md"), "changed");
    const result = inspectGit(directory);
    assert.equal(result.clean, false);
    assert.deepEqual(result.changes, [" M README.md"]);
  });
});

test("checkpoint gate binds approval to the reviewed delivery digest", () => {
  assert.doesNotThrow(() => assertCheckpointAllowed({
    decision: "APPROVED",
    reviewedDeliveryDigest: "a".repeat(64),
    currentDeliveryDigest: "a".repeat(64),
  }));
  assert.throws(() => assertCheckpointAllowed({
    decision: "APPROVED",
    reviewedDeliveryDigest: "a".repeat(64),
    currentDeliveryDigest: "b".repeat(64),
  }), /delivery digest changed after review/);
  assert.throws(() => assertCheckpointAllowed({
    decision: "CHANGES_REQUIRED",
    reviewedDeliveryDigest: "a".repeat(64),
    currentDeliveryDigest: "a".repeat(64),
  }), /checkpoint requires APPROVED review/);
});
