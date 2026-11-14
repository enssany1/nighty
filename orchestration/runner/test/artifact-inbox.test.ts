import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  discoverArtifacts,
  publishArtifact,
  quarantineArtifact,
} from "../src/artifact-inbox.ts";

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

test("publication refuses an artifact above the configured size bound", () => {
  withDirectory((directory) => {
    assert.throws(
      () => publishArtifact(directory, "TASK-001.md", "x".repeat(2048), () => undefined, {
        maxBytes: 1024,
      }),
      /exceeds the 1024-byte limit/,
    );
    assert.deepEqual(readdirSync(directory), []);
  });
});

test("conflicting artifacts are quarantined with digest metadata and removed from the inbox", () => {
  withDirectory((directory) => {
    const quarantine = path.join(directory, "quarantine");
    const inbox = path.join(directory, "deliveries");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(path.join(inbox, "TASK-901-A01-DELIVERY.md"), "conflicting");

    const result = quarantineArtifact({
      directory: inbox,
      name: "TASK-901-A01-DELIVERY.md",
      quarantineDirectory: quarantine,
      reason: "delivery digest conflicts with recorded identity",
      expectedDigest: "a".repeat(64),
      actualDigest: "b".repeat(64),
    });

    assert.match(result.quarantinedPath, /\.quarantine$/);
    assert.deepEqual(readdirSync(inbox), []);
    const metadata = JSON.parse(readFileSync(result.metadataPath, "utf8")) as Record<string, unknown>;
    assert.equal(metadata.schema, "nighty.quarantine/v1");
    assert.equal(metadata.artifact, "TASK-901-A01-DELIVERY.md");
    assert.equal(metadata.reason, "delivery digest conflicts with recorded identity");
    assert.equal(metadata.expectedDigest, "a".repeat(64));
    assert.equal(metadata.actualDigest, "b".repeat(64));
    assert.equal(readFileSync(result.quarantinedPath, "utf8"), "conflicting");
  });
});
