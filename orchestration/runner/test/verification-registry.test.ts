import assert from "node:assert/strict";
import test from "node:test";

import { VerificationRegistry } from "../src/verification-registry.ts";

test("verification registry runs only a named immutable command", async () => {
  const registry = new VerificationRegistry();
  registry.register("node-version", {
    executable: process.execPath,
    args: ["--version"],
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
  });

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
  const command = {
    executable: process.execPath,
    args: ["--version"],
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
  };
  registry.register("check", command);
  assert.throws(() => registry.register("check", command), /already registered/);
});
