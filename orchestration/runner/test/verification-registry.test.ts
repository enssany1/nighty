import assert from "node:assert/strict";
import test from "node:test";

import { VerificationRegistry } from "../src/verification-registry.ts";

function nodeCommand(args: string[]) {
  return {
    executable: process.execPath,
    args,
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
  };
}

test("verification registry runs only a named immutable command", async () => {
  const registry = new VerificationRegistry();
  registry.register("node-version", nodeCommand(["--version"]));

  const result = await registry.run("node-version", process.cwd(), {});
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^v24\./);
});

test("verification registry rejects unknown command identifiers", async () => {
  const registry = new VerificationRegistry();
  await assert.rejects(
    registry.run("report-supplied-command", process.cwd(), {}),
    /verification command is not registered/,
  );
});

test("verification command identifiers cannot be registered twice", () => {
  const registry = new VerificationRegistry();
  const command = nodeCommand(["--version"]);
  registry.register("check", command);
  assert.throws(() => registry.register("check", command), /already registered/);
});

test("sealing freezes the command set but still permits registered runs", async () => {
  const registry = new VerificationRegistry();
  registry.register("node-version", nodeCommand(["--version"]));
  const seal = registry.seal();

  assert.equal(seal.sealed, true);
  assert.match(seal.digest, /^[0-9a-f]{64}$/);
  assert.throws(
    () => registry.register("late-command", nodeCommand(["--version"])),
    /verification registry is sealed/,
  );
  const result = await registry.run("node-version", process.cwd(), {});
  assert.equal(result.exitCode, 0);
});

test("finalize requires every required verification command to pass", async () => {
  const registry = new VerificationRegistry();
  registry.register("pass", nodeCommand(["-e", "process.exit(0)"]));
  registry.register("fail", nodeCommand(["-e", "process.exit(3)"]));
  registry.register("unrun", nodeCommand(["-e", "process.exit(0)"]));
  registry.seal();

  await registry.run("pass", process.cwd(), {});
  await registry.run("fail", process.cwd(), {});

  assert.throws(
    () => registry.finalize(["pass", "unrun"]),
    /required verification command did not run: unrun/,
  );
  assert.throws(
    () => registry.finalize(["pass", "fail"]),
    /required verification command failed: fail/,
  );
  assert.throws(
    () => registry.finalize(["pass", "ghost"]),
    /required verification command is not registered: ghost/,
  );

  const report = registry.finalize(["pass"]);
  assert.equal(report.schema, "nighty.verification/v1");
  assert.equal(report.sealed, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]?.id, "pass");
  assert.equal(report.results[0]?.exitCode, 0);
  assert.match(report.results[0]?.stdoutSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.match(report.reportSha256, /^[0-9a-f]{64}$/);
  assert.match(report.digest, /^[0-9a-f]{64}$/);
});

test("finalize fails closed before the registry is sealed", () => {
  const registry = new VerificationRegistry();
  registry.register("check", nodeCommand(["--version"]));
  assert.throws(
    () => registry.finalize(["check"]),
    /verification registry must be sealed before finalize/,
  );
});

test("finalize records a timed-out command as a failed required check", async () => {
  const registry = new VerificationRegistry();
  registry.register("slow", nodeCommand(["-e", "setTimeout(() => {}, 3000)"]));
  registry.seal();

  const result = await registry.run("slow", process.cwd(), {});
  assert.equal(result.timedOut, true);
  assert.throws(
    () => registry.finalize(["slow"]),
    /required verification command failed: slow/,
  );
});

test("verification claims must match observed pass, fail, and unverified reality", async () => {
  const registry = new VerificationRegistry();
  registry.register("pass", nodeCommand(["-e", "process.exit(0)"]));
  registry.register("fail", nodeCommand(["-e", "process.exit(4)"]));
  registry.register("unrun", nodeCommand(["-e", "process.exit(0)"]));
  registry.seal();
  await registry.run("pass", process.cwd(), {});
  await registry.run("fail", process.cwd(), {});

  const reality = registry.verificationReality(["pass", "fail", "unrun"]);
  assert.deepEqual(reality.map(({ id, status, exitCode }) => ({ id, status, exitCode })), [
    { id: "pass", status: "PASSED", exitCode: 0 },
    { id: "fail", status: "FAILED", exitCode: 4 },
    { id: "unrun", status: "UNVERIFIED", exitCode: null },
  ]);
  assert.doesNotThrow(() => registry.validateClaims([
    { id: "pass", status: "PASSED" },
    { id: "fail", status: "FAILED" },
    { id: "unrun", status: "UNVERIFIED" },
  ], ["pass", "fail", "unrun"]));
  assert.throws(
    () => registry.validateClaims([{ id: "fail", status: "PASSED" }], ["fail"]),
    /claim does not match observed reality/,
  );
});

test("verification claims cannot add commands or inject arguments", () => {
  const registry = new VerificationRegistry();
  registry.register("check", nodeCommand(["--version"]));
  registry.seal();
  assert.throws(
    () => registry.validateClaims([
      { id: "check -- --danger", status: "PASSED" },
    ], ["check"]),
    /unregistered verification claim/,
  );
  assert.throws(
    () => registry.validateClaims([
      { id: "check", status: "UNVERIFIED" },
      { id: "check", status: "UNVERIFIED" },
    ], ["check"]),
    /duplicate verification claim/,
  );
});
