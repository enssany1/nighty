import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseMarkdownArtifact } from "../src/markdown.ts";
import { withDirectory } from "./support.ts";

const DELIVERY = `---
schema: nighty.delivery/v1
task_id: TASK-901
task_revision: 1
attempt: A01
run_id: 7f4f2a8c-6f8a-4a1f-8a55-5f5f39f4a3b1
status: DELIVERED
baseline_commit: NOT_INITIALIZED
delivered_commit: UNCOMMITTED
created_by: deepseek
created_at: 2026-11-14T18:00:00+04:00
---

# TASK-901 delivery

## Implementation summary

Bounded parsing.

\`\`\`markdown
## Not a real section
\`\`\`

## Tests actually executed

- npm test
`;

test("Markdown parsing extracts bounded front matter and real sections only", () => {
  const parsed = parseMarkdownArtifact(DELIVERY, { maxBytes: 64 * 1024 });

  assert.equal(parsed.frontMatter.schema, "nighty.delivery/v1");
  assert.equal(parsed.frontMatter.task_revision, 1);
  assert.equal(parsed.frontMatter.attempt, "A01");
  assert.deepEqual(parsed.sections, [
    "Implementation summary",
    "Tests actually executed",
  ]);
});

test("Markdown parsing rejects invalid UTF-8 and control characters", async () => {
  await withDirectory("nighty-markdown-", async (directory) => {
    const invalid = path.join(directory, "invalid.md");
    writeFileSync(invalid, Buffer.from([0x2d, 0xff, 0x0a]));
    assert.throws(
      () => parseMarkdownArtifact(invalid, { maxBytes: 1024, fromFile: true }),
      /not valid UTF-8/,
    );

    const nul = path.join(directory, "nul.md");
    writeFileSync(nul, "## Objective\u0000hidden");
    assert.throws(
      () => parseMarkdownArtifact(nul, { maxBytes: 1024, fromFile: true }),
      /control character/,
    );
  });
});

test("Markdown parsing refuses oversized documents before parsing", () => {
  assert.throws(
    () => parseMarkdownArtifact("x".repeat(2048), { maxBytes: 1024 }),
    /exceeds the 1024-byte limit/,
  );
});

test("Markdown parsing fails closed on malformed front matter", () => {
  assert.throws(
    () => parseMarkdownArtifact("---\nschema: incomplete\n\n## Objective\n\ntext", {
      maxBytes: 1024,
    }),
    /front matter/,
  );
  assert.throws(
    () => parseMarkdownArtifact("## Objective\n\ntext", { maxBytes: 1024 }),
    /front matter/,
  );
});
