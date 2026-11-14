import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CodexAdapter } from "../src/codex-adapter.ts";

test("Codex adapter sends instructions on stdin and reads schema output", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-codex-"));
  try {
    const fakeCli = path.join(directory, "fake-codex.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      [
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "let prompt = '';",
        "for await (const chunk of process.stdin) prompt += chunk;",
        "const output = args[args.indexOf('-o') + 1];",
        "fs.writeFileSync(output, JSON.stringify({ decision: 'APPROVED', prompt }));",
        "process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');",
      ].join("\n"),
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
    });

    const result = await adapter.run({
      prompt: "review TASK-001",
      outputSchemaPath: schema,
      outputPath: output,
    });

    assert.deepEqual(result.output, { decision: "APPROVED", prompt: "review TASK-001" });
    assert.equal(result.process.exitCode, 0);
    assert.match(readFileSync(output, "utf8"), /APPROVED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Codex adapter rejects a successful process without structured output", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-codex-"));
  try {
    const fakeCli = path.join(directory, "fake-codex.mjs");
    const schema = path.join(directory, "schema.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(fakeCli, "process.exit(0);");
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
    });

    await assert.rejects(
      adapter.run({
        prompt: "review",
        outputSchemaPath: schema,
        outputPath: path.join(directory, "missing.json"),
      }),
      /structured output was not created/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
