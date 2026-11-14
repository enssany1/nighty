import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverArtifacts, publishArtifact } from "../src/artifact-inbox.ts";

function withDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-inbox-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("publishing validates then atomically exposes the final artifact", () => {
  withDirectory((directory) => {
    const result = publishArtifact(directory, "TASK-001.md", "approved content", (value) => {
      assert.match(value, /approved/);
    });

    assert.equal(result.status, "published");
    assert.equal(result.sha256.length, 64);
    assert.equal(readFileSync(path.join(directory, "TASK-001.md"), "utf8"), "approved content");
    assert.deepEqual(readdirSync(directory), ["TASK-001.md"]);
  });
});

test("same artifact is idempotent and different content conflicts", () => {
  withDirectory((directory) => {
    publishArtifact(directory, "TASK-001.md", "one", () => undefined);
    assert.equal(
      publishArtifact(directory, "TASK-001.md", "one", () => undefined).status,
      "duplicate",
    );
    assert.throws(
      () => publishArtifact(directory, "TASK-001.md", "two", () => undefined),
      /conflicting artifact already exists/,
    );
    assert.equal(readFileSync(path.join(directory, "TASK-001.md"), "utf8"), "one");
  });
});

test("failed validation never publishes a partial artifact", () => {
  withDirectory((directory) => {
    assert.throws(
      () => publishArtifact(directory, "TASK-002.md", "bad", () => {
        throw new Error("invalid report");
      }),
      /invalid report/,
    );
    assert.deepEqual(readdirSync(directory), []);
  });
});

test("discovery ignores temporary hidden and unrecognized files", () => {
  withDirectory((directory) => {
    for (const name of ["TASK-001.md", "TASK-002.md.tmp", ".editor.md", "notes.txt"]) {
      writeFileSync(path.join(directory, name), name);
    }
    assert.deepEqual(discoverArtifacts(directory), ["TASK-001.md"]);
  });
});
