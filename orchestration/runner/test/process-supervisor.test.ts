import assert from "node:assert/strict";
import test from "node:test";

import { runOwnedProcess } from "../src/process-supervisor.ts";

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

test("supervisor times out and terminates its owned child", async () => {
  const started = Date.now();
  const result = await runOwnedProcess({
    executable: process.execPath,
    args: ["-e", "setTimeout(() => {}, 5000)"],
    cwd: process.cwd(),
    allowedExecutables: [process.execPath],
    timeoutMs: 100,
    maxOutputBytes: 1024,
    environment: {},
  });

  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2_000);
});

test("supervisor rejects output beyond the configured cap", async () => {
  await assert.rejects(
    runOwnedProcess({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(2048))"],
      cwd: process.cwd(),
      allowedExecutables: [process.execPath],
      timeoutMs: 2_000,
      maxOutputBytes: 128,
      environment: {},
    }),
    /process output exceeded 128 bytes/,
  );
});
