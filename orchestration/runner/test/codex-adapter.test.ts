import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CodexAdapter } from "../src/codex-adapter.ts";
import { SecretRedactor } from "../src/redaction.ts";

const REVIEW_SCHEMA = path.resolve(
  import.meta.dirname,
  "..",
  "schemas",
  "review.schema.json",
);

const VALID_REVIEW = {
  schema: "nighty.review/v1",
  task_id: "TASK-901",
  task_revision: 1,
  attempt: "A01",
  run_id: "7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1",
  decision: "APPROVED",
  reviewed_by: "codex",
  created_at: "2026-11-14T18:00:00+04:00",
  delivery_sha256: "a".repeat(64),
  baseline_commit: "b".repeat(40),
  head_commit: "c".repeat(40),
  branch: "main",
  source_sha256: "d".repeat(64),
  tree_sha256: "e".repeat(64),
  task_sha256: "f".repeat(64),
  mandatory_criteria_verified: true,
  sections: [
    "Decision",
    "Independent inspection",
    "Requirement-by-requirement findings",
    "Tests independently executed",
    "Security/architecture review",
    "Actionable changes",
    "Limitations/unverified coverage",
    "Next transition",
  ],
  section_content: {
    "Decision": "Approved.",
    "Independent inspection": "Inspected source and diff.",
    "Requirement-by-requirement findings": "All requirements satisfied.",
    "Tests independently executed": "Focused checks passed.",
    "Security/architecture review": "No blocking finding.",
    "Actionable changes": "None.",
    "Limitations/unverified coverage": "None.",
    "Next transition": "Checkpoint.",
  },
};

test("Codex adapter places exec-specific arguments after the exec subcommand", async () => {
  await withTemp(async (directory) => {
    const fakeCli = path.join(directory, "fake-args.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(fakeCli, [
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      "fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({ args }));",
    ].join("\n"));
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      execArgs: ["--ephemeral", "--ignore-user-config"],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 8_192,
    });
    const result = await adapter.run({
      prompt: "review",
      outputSchemaPath: schema,
      outputPath: output,
    });
    const args = result.output.args as string[];
    assert.deepEqual(args.slice(0, 3), ["exec", "--ephemeral", "--ignore-user-config"]);
  });
});

function script(body: string): string {
  return body;
}

function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-codex-"));
  return run(directory).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}

test("Codex adapter sends instructions on stdin and reads schema output", async () => {
  await withTemp(async (directory) => {
    const fakeCli = path.join(directory, "fake-codex.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      script([
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "let prompt = '';",
        "for await (const chunk of process.stdin) prompt += chunk;",
        "const output = args[args.indexOf('-o') + 1];",
        "fs.writeFileSync(output, JSON.stringify({ decision: 'APPROVED', prompt }));",
        "process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');",
      ].join("\n")),
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
  });
});

test("Codex adapter rejects a successful process without structured output", async () => {
  await withTemp(async (directory) => {
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
  });
});

test("Codex adapter locally rejects result that violates the tightened schema", async () => {
  await withTemp(async (directory) => {
    const schema = path.join(directory, "review.schema.json");
    writeFileSync(schema, readFileSync(REVIEW_SCHEMA, "utf8"));
    for (const [label, payload] of [
      ["missing-fields", { decision: "APPROVED" }],
      ["bad-decision", { ...VALID_REVIEW, decision: "MAYBE" }],
      ["extra-field", { ...VALID_REVIEW, unexpected: true }],
      ["bad-task-digest", { ...VALID_REVIEW, task_sha256: "not-a-digest" }],
    ] as const) {
      const fakeCli = path.join(directory, `fake-${label}.mjs`);
      const output = path.join(directory, `result-${label}.json`);
      writeFileSync(
        fakeCli,
        [
          "import fs from 'node:fs';",
          "const args = process.argv.slice(2);",
          "fs.writeFileSync(args[args.indexOf('-o') + 1], " + JSON.stringify(JSON.stringify(payload)) + ");",
        ].join("\n"),
      );
      const adapter = new CodexAdapter({
        executable: process.execPath,
        baseArgs: [fakeCli],
        projectRoot: directory,
        environment: {},
        timeoutMs: 2_000,
        maxOutputBytes: 8192,
        maxSchemaBytes: 64 * 1024,
      });
      await assert.rejects(
        adapter.run({ prompt: "review", outputSchemaPath: schema, outputPath: output }),
        /failed local schema validation/,
        label,
      );
    }
  });
});

test("Codex adapter accepts a valid tightened review result", async () => {
  await withTemp(async (directory) => {
    const fakeCli = path.join(directory, "fake-valid.mjs");
    const output = path.join(directory, "result-valid.json");
    const schema = path.join(directory, "review.schema.json");
    writeFileSync(schema, readFileSync(REVIEW_SCHEMA, "utf8"));
    writeFileSync(
      fakeCli,
      [
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "fs.writeFileSync(args[args.indexOf('-o') + 1], " + JSON.stringify(JSON.stringify(VALID_REVIEW)) + ");",
      ].join("\n"),
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 8192,
      maxSchemaBytes: 64 * 1024,
    });
    const result = await adapter.run({
      prompt: "review",
      outputSchemaPath: schema,
      outputPath: output,
    });
    assert.deepEqual(result.output, VALID_REVIEW);
  });
});

test("Codex adapter bounds the prompt and schema before allocating", async () => {
  await withTemp(async (directory) => {
    const marker = path.join(directory, "executed.marker");
    const fakeCli = path.join(directory, "fake-bound.mjs");
    const schema = path.join(directory, "schema.json");
    writeFileSync(schema, JSON.stringify({ type: "object", padding: "x".repeat(2048) }));
    writeFileSync(
      fakeCli,
      "import fs from 'node:fs'; fs.writeFileSync(" + JSON.stringify(marker) + ", 'ran');",
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
      maxPromptBytes: 16,
      maxSchemaBytes: 512,
    });

    await assert.rejects(
      adapter.run({
        prompt: "x".repeat(64),
        outputSchemaPath: schema,
        outputPath: path.join(directory, "out.json"),
      }),
      /prompt exceeds the 16-byte limit/,
    );
    await assert.rejects(
      adapter.run({
        prompt: "short",
        outputSchemaPath: schema,
        outputPath: path.join(directory, "out.json"),
      }),
      /exceeds the 512-byte limit/,
    );
    assert.throws(() => readFileSync(marker));
  });
});

test("Codex adapter rejects invalid UTF-8 structured output", async () => {
  await withTemp(async (directory) => {
    const fakeCli = path.join(directory, "fake-bytes.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      [
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "fs.writeFileSync(args[args.indexOf('-o') + 1], Buffer.from([0xff, 0xfe, 0x41]));",
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
    await assert.rejects(
      adapter.run({ prompt: "review", outputSchemaPath: schema, outputPath: output }),
      /not valid UTF-8/,
    );
  });
});

test("Codex adapter never persists an output containing the explicit credential", async () => {
  await withTemp(async (directory) => {
    const secret = "test-only-credential-9c2f4e6a8b0d1f3e5a7c";
    const fakeCli = path.join(directory, "fake-output-secret.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      [
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({ leaked: " + JSON.stringify(secret) + " }));",
      ].join("\n"),
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
      redactor: new SecretRedactor([secret]),
    });

    await assert.rejects(
      adapter.run({ prompt: "review", outputSchemaPath: schema, outputPath: output }),
      /still contains the explicit credential value/,
    );
    assert.throws(() => readFileSync(output, "utf8"), /ENOENT/);
  });
});

test("Codex adapter forwards the provider process start identity", async () => {
  await withTemp(async (directory) => {
    const fakeCli = path.join(directory, "fake-owner.mjs");
    const schema = path.join(directory, "schema.json");
    const output = path.join(directory, "result.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      [
        "import fs from 'node:fs';",
        "const args = process.argv.slice(2);",
        "fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({ ok: true }));",
      ].join("\n"),
    );
    let observed: { runId: string; rootPid: number; startedAt: string } | undefined;
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
      onProcessStarted: (identity) => {
        observed = identity;
      },
    });

    const result = await adapter.run({
      prompt: "review",
      outputSchemaPath: schema,
      outputPath: output,
    });
    assert.ok(observed);
    assert.equal(observed.runId, result.process.runId);
    assert.equal(observed.rootPid, result.process.rootPid);
    assert.ok(observed.rootPid > 0);
  });
});

test("Codex adapter refuses output and schema paths outside projectRoot without touching victims", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "nighty-adapter-paths-"));
  const root = path.join(parent, "root");
  const outside = path.join(parent, "outside");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(root);
  mkdirSync(outside);
  try {
    const schema = path.join(root, "schema.json");
    const marker = path.join(root, "executed.marker");
    const fakeCli = path.join(root, "fake-paths.mjs");
    const victim = path.join(outside, "victim.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(victim, "sentinel");
    writeFileSync(
      fakeCli,
      "import fs from 'node:fs'; fs.writeFileSync(" + JSON.stringify(marker) + ", 'ran');",
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: root,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
    });

    await assert.rejects(
      adapter.run({ prompt: "review", outputSchemaPath: schema, outputPath: victim }),
      /structured output path resolves outside project root/,
    );
    assert.equal(readFileSync(victim, "utf8"), "sentinel");
    assert.throws(() => readFileSync(marker));

    await assert.rejects(
      adapter.run({ prompt: "review", outputSchemaPath: victim, outputPath: path.join(root, "out.json") }),
      /output schema path resolves outside project root/,
    );
    assert.equal(readFileSync(victim, "utf8"), "sentinel");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("Codex adapter rejects reparse-point paths inside projectRoot", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "nighty-adapter-reparse-"));
  const root = path.join(parent, "root");
  const outside = path.join(parent, "outside");
  const { mkdirSync, symlinkSync } = await import("node:fs");
  mkdirSync(root);
  mkdirSync(outside);
  try {
    const victim = path.join(outside, "victim.json");
    writeFileSync(victim, "sentinel");
    const linked = path.join(root, "linked");
    symlinkSync(outside, linked, "junction");
    const schema = path.join(root, "schema.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    const adapter = new CodexAdapter({
      executable: process.execPath,
      projectRoot: root,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
    });

    await assert.rejects(
      adapter.run({
        prompt: "review",
        outputSchemaPath: schema,
        outputPath: path.join(linked, "victim.json"),
      }),
      /reparse point|symbolic link/i,
    );
    assert.equal(readFileSync(victim, "utf8"), "sentinel");

    await assert.rejects(
      adapter.run({
        prompt: "review",
        outputSchemaPath: path.join(linked, "schema.json"),
        outputPath: path.join(root, "out.json"),
      }),
      /reparse point|symbolic link/i,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("Codex adapter redacts the explicit credential from process errors", async () => {
  await withTemp(async (directory) => {
    const secret = "test-only-credential-7f3a9b1c5d2e4f60a8b7";
    const fakeCli = path.join(directory, "fake-secret.mjs");
    const schema = path.join(directory, "schema.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    writeFileSync(
      fakeCli,
      "process.stderr.write('authentication failed for " + secret + "'); process.exit(2);",
    );
    const adapter = new CodexAdapter({
      executable: process.execPath,
      baseArgs: [fakeCli],
      projectRoot: directory,
      environment: {},
      timeoutMs: 2_000,
      maxOutputBytes: 4096,
      redactor: new SecretRedactor([secret]),
    });

    await assert.rejects(
      adapter.run({
        prompt: "review",
        outputSchemaPath: schema,
        outputPath: path.join(directory, "out.json"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /exit code 2/);
        assert.equal(error.message.includes(secret), false);
        assert.match(error.message, /\[REDACTED\]/);
        return true;
      },
    );
  });
});
