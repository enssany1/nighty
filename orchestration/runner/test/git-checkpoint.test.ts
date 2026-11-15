import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { GitCheckpoint } from "../src/git-checkpoint.ts";
import { inspectGit } from "../src/git-gate.ts";
import { runGit } from "./git-support.ts";

function repository(): string {
  const root = mkdtempSync(path.join(tmpdir(), "nighty-checkpoint-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.name", "Nighty Test"]);
  runGit(root, ["config", "user.email", "nighty-test@localhost"]);
  writeFileSync(path.join(root, "README.md"), "baseline\n");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-m", "chore: baseline"]);
  return root;
}

test("Git checkpoint requires a clean source baseline", () => {
  const root = repository();
  try {
    const checkpoint = new GitCheckpoint({ root });
    checkpoint.assertCleanBaseline();
    writeFileSync(path.join(root, "dirty.ts"), "export const dirty = true;\n");
    assert.throws(() => checkpoint.assertCleanBaseline(), /clean source baseline/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Git checkpoint commits exactly the approved inventory once", () => {
  const root = repository();
  try {
    writeFileSync(path.join(root, "feature.ts"), "export const value = 1;\n");
    const approved = inspectGit(root);
    const checkpoint = new GitCheckpoint({ root });
    const result = checkpoint.commit({ taskId: "TASK-901", approved });

    assert.match(result.commit, /^[0-9a-f]{40}$/);
    assert.equal(runGit(root, ["log", "-1", "--pretty=%s"]), "feat(task-901): checkpoint approved changes");
    assert.equal(runGit(root, ["show", "--pretty=", "--name-only", "HEAD"]), "feature.ts");
    assert.equal(readFileSync(path.join(root, "feature.ts"), "utf8"), "export const value = 1;\n");
    assert.throws(
      () => checkpoint.commit({ taskId: "TASK-901", approved }),
      /head changed|approved source changed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Git checkpoint rejects branch drift before staging", () => {
  const root = repository();
  try {
    writeFileSync(path.join(root, "feature.ts"), "export const value = 1;\n");
    const approved = inspectGit(root);
    runGit(root, ["switch", "-c", "other"]);
    const checkpoint = new GitCheckpoint({ root });
    assert.throws(() => checkpoint.commit({ taskId: "TASK-901", approved }), /branch changed/);
    assert.equal(runGit(root, ["diff", "--cached", "--name-only"]), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Git checkpoint exposes commit failure without claiming success", () => {
  const root = repository();
  try {
    writeFileSync(path.join(root, "feature.ts"), "export const value = 1;\n");
    const approved = inspectGit(root);
    const checkpoint = new GitCheckpoint({
      root,
      commit: () => {
        throw new Error("injected commit failure");
      },
    });
    assert.throws(
      () => checkpoint.commit({ taskId: "TASK-901", approved }),
      /injected commit failure/,
    );
    assert.equal(runGit(root, ["rev-parse", "HEAD"]), approved.head);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
