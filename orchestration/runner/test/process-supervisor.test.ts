import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ProcessOutputLimitError,
  ProcessOwnershipError,
  runOwnedProcess,
} from "../src/process-supervisor.ts";
import { withDirectory } from "./support.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntilDead(pid: number, timeoutMs = 4_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isAlive(pid);
}

const GRANDCHILD_SCRIPT = [
  "const { spawn } = require('node:child_process');",
  "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
  "process.stdout.write(String(grandchild.pid));",
  "setInterval(() => {}, 1000);",
].join("\n");

test("supervisor captures bounded output and exit identity", async () => {
  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", "process.stdout.write('ok')"],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    environment: {},
  });

  assert.deepEqual(
    { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut },
    { exitCode: 0, stdout: "ok", stderr: "", timedOut: false },
  );
  assert.match(result.runId, /^[0-9a-f-]{36}$/);
  assert.equal(result.cleanup, null);
  assert.equal(typeof result.rootPid, "number");
});

test("supervisor refuses an executable outside the allowlist", async () => {
  await assert.rejects(
    runOwnedProcess({
      executable: "untrusted-tool.exe",
      args: [],
      cwd: process.cwd(),
      allowedExecutables: [process.execPath],
      timeoutMs: 100,
      maxOutputBytes: 1024,
      environment: {},
    }),
    /executable is not allowlisted/,
  );
});

test("supervisor timeout terminates the whole owned process family", async () => {
  const started = Date.now();
  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", GRANDCHILD_SCRIPT],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 1_000,
    maxOutputBytes: 1024,
    environment: {},
    cleanupTimeoutMs: 5_000,
  });

  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 8_000);
  assert.equal(result.cleanup?.attempted, true);
  assert.equal(result.cleanup?.verified, true);
  assert.equal(result.cleanup?.deadlineExceeded, false);
  assert.equal(result.cleanup?.rootPid, result.rootPid);
  assert.ok((result.cleanup?.candidatePids.length ?? 0) >= 1);

  const grandchildPid = Number(result.stdout);
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0, "grandchild pid should be captured");
  assert.equal(await waitUntilDead(grandchildPid), true, "grandchild " + grandchildPid + " survived cleanup");
});

test("supervisor output overflow still cleans the owned process family", async () => {
  await withDirectory("nighty-family-", async (directory) => {
    const pidFile = path.join(directory, "grandchild.pid");
    const script = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(" + JSON.stringify(pidFile) + ", String(grandchild.pid));",
      "setInterval(() => { process.stdout.write('x'.repeat(512)); }, 20);",
    ].join("\n");

    try {
      await assert.rejects(
        runOwnedProcess({
          executable: process.execPath,
          args: ["-e", script],
          cwd: directory,
          allowedExecutables: [process.execPath],
          timeoutMs: 5_000,
          maxOutputBytes: 256,
          environment: {},
          cleanupTimeoutMs: 5_000,
        }),
        (error: unknown) => {
          assert.ok(error instanceof ProcessOutputLimitError);
          assert.match(error.message, /process output exceeded 256 bytes/);
          assert.equal(error.cleanup?.attempted, true);
          assert.equal(error.cleanup?.verified, true);
          return true;
        },
      );

      const grandchildPid = Number(readFileSync(pidFile, "utf8"));
      assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0);
      assert.equal(await waitUntilDead(grandchildPid), true, "grandchild survived overflow cleanup");
    } finally {
      // The temporary directory is removed by withDirectory after this block.
    }
  });
});

test("supervisor reports the owned root pid synchronously at process start", async () => {
  let observed: { runId: string; rootPid: number; startedAt: string } | undefined;
  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", "setTimeout(() => process.exit(0), 300)"],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    environment: {},
    onStarted: (identity) => {
      observed = identity;
    },
  });

  assert.ok(observed);
  assert.equal(observed.runId, result.runId);
  assert.equal(observed.rootPid, result.rootPid);
  assert.ok(observed.rootPid > 0);
  assert.ok(!Number.isNaN(Date.parse(observed.startedAt)));
});

test("supervisor fails closed and cleans the family when ownership recording throws", async () => {
  await withDirectory("nighty-ownership-", async (directory) => {
    const pidFile = path.join(directory, "grandchild.pid");
    const script = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(" + JSON.stringify(pidFile) + ", String(grandchild.pid));",
      "setInterval(() => {}, 1000);",
    ].join("\n");

    await assert.rejects(
      runOwnedProcess({
        executable: process.execPath,
        args: ["-e", script],
        cwd: directory,
        allowedExecutables: [process.execPath],
        timeoutMs: 5_000,
        maxOutputBytes: 1024,
        environment: {},
        cleanupTimeoutMs: 5_000,
        onStarted: () => {
          // Give the provider time to spawn a descendant before failing the
          // ownership write, proving the failure path terminates the family.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
          throw new Error("ownership write failed");
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ProcessOwnershipError);
        assert.match(error.message, /ownership write failed/);
        assert.equal(error.cleanup?.attempted, true);
        assert.equal(error.cleanup?.verified, true);
        return true;
      },
    );

    const grandchildPid = Number(readFileSync(pidFile, "utf8"));
    assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0);
    assert.equal(await waitUntilDead(grandchildPid), true, "grandchild survived ownership failure cleanup");
  });
});

test("supervisor cleans a descendant that outlives a normally exiting root", async () => {
  const script = [
    "const { spawn } = require('node:child_process');",
    "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });",
    "process.stdout.write(String(grandchild.pid));",
    "setTimeout(() => process.exit(0), 1500);",
  ].join("\n");

  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", script],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 6_000,
    maxOutputBytes: 1024,
    environment: {},
    cleanupTimeoutMs: 5_000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.cleanup?.attempted, true);
  assert.equal(result.cleanup?.verified, true);
  const grandchildPid = Number(result.stdout);
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0);
  assert.equal(await waitUntilDead(grandchildPid, 1_000), true, "grandchild must be dead before the result returns");
});

test("supervisor delivers bounded instructions through stdin", async () => {
  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", "process.stdin.pipe(process.stdout)"],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    environment: {},
    stdin: "task instructions",
  });

  assert.equal(result.stdout, "task instructions");
  assert.equal(result.exitCode, 0);
});
