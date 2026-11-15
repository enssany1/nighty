import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseMarkdownArtifact } from "../src/markdown.ts";
import { StructuredArtifactProducer } from "../src/structured-artifact-producer.ts";

test("structured producer publishes canonical Markdown only after validated output", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "nighty-structured-producer-"));
  try {
    const schema = path.join(root, "schema.json");
    const output = path.join(root, "delivery.md");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    const producer = new StructuredArtifactProducer({
      projectRoot: root,
      adapter: {
        async run(input) {
          assert.notEqual(input.outputPath, output);
          assert.equal(existsSync(output), false);
          return {
            output: {
              schema: "nighty.delivery/v1",
              task_id: "TASK-901",
              task_revision: 1,
              attempt: "A01",
              run_id: "7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1",
              status: "DELIVERED",
              baseline_commit: "a".repeat(40),
              delivered_commit: "UNCOMMITTED",
              created_by: "deepseek",
              created_at: "2026-11-14T18:00:00+04:00",
              sections: ["Implementation summary", "Completion statement"],
              section_content: {
                "Implementation summary": "Implemented the requested change.",
                "Completion statement": "Ready for independent review.",
              },
            },
            process: { exitCode: 0, timedOut: false },
          };
        },
      },
    });

    const result = await producer.run({
      prompt: "deliver",
      outputSchemaPath: schema,
      outputPath: output,
    });

    assert.equal(result.process.exitCode, 0);
    const parsed = parseMarkdownArtifact(output, { fromFile: true, maxBytes: 16_384 });
    assert.equal(parsed.frontMatter.task_id, "TASK-901");
    assert.deepEqual(parsed.sections, ["Implementation summary", "Completion statement"]);
    assert.match(parsed.body, /Implemented the requested change/);
    assert.equal(existsSync(output + ".structured.json"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("structured producer leaves no final artifact when section content is incomplete", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "nighty-structured-producer-invalid-"));
  try {
    const schema = path.join(root, "schema.json");
    const output = path.join(root, "review.md");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    const producer = new StructuredArtifactProducer({
      projectRoot: root,
      adapter: {
        async run() {
          return {
            output: {
              schema: "nighty.review/v1",
              sections: ["Decision"],
              section_content: {},
            },
            process: { exitCode: 0, timedOut: false },
          };
        },
      },
    });
    await assert.rejects(
      producer.run({ prompt: "review", outputSchemaPath: schema, outputPath: output }),
      /missing content for section: Decision/,
    );
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
