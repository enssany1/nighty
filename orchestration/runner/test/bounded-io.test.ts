import assert from "node:assert/strict";
import {
  mkdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertControlArtifactPath,
  readBoundedJsonFile,
  readBoundedUtf8File,
} from "../src/bounded-io.ts";
import { withDirectory } from "./support.ts";

test("bounded reader rejects a file above the cap before consuming it", async () => {
  await withDirectory("nighty-bounded-", async (directory) => {
    const file = path.join(directory, "oversized.md");
    writeFileSync(file, "x".repeat(4096));

    assert.throws(
      () => readBoundedUtf8File(file, { maxBytes: 1024, rejectControlArtifacts: true }),
      /exceeds the 1024-byte limit/,
    );
  });
});

test("bounded reader rejects invalid UTF-8 instead of replacing bytes", async () => {
  await withDirectory("nighty-bounded-", async (directory) => {
    const file = path.join(directory, "invalid.md");
    writeFileSync(file, Buffer.from([0x41, 0xff, 0xfe, 0x42]));

    assert.throws(
      () => readBoundedUtf8File(file, { maxBytes: 1024, rejectControlArtifacts: true }),
      /not valid UTF-8/,
    );
  });
});

test("control artifact reads reject reparse points while ordinary reads may follow", async () => {
  await withDirectory("nighty-bounded-", async (directory) => {
    const real = path.join(directory, "real");
    mkdirSync(real);
    writeFileSync(path.join(real, "artifact.md"), "bounded");
    const junction = path.join(directory, "linked");
    symlinkSync(real, junction, "junction");

    assert.throws(
      () => assertControlArtifactPath(path.join(junction, "artifact.md")),
      /reparse point|symbolic link/i,
    );
    assert.throws(
      () => readBoundedUtf8File(path.join(junction, "artifact.md"), {
        maxBytes: 1024,
        rejectControlArtifacts: true,
      }),
      /reparse point|symbolic link/i,
    );
    assert.equal(
      readBoundedUtf8File(path.join(junction, "artifact.md"), {
        maxBytes: 1024,
        rejectControlArtifacts: false,
      }),
      "bounded",
    );
  });
});

test("bounded reader rejects directories and missing files with typed errors", async () => {
  await withDirectory("nighty-bounded-", async (directory) => {
    assert.throws(
      () => readBoundedUtf8File(directory, { maxBytes: 1024, rejectControlArtifacts: true }),
      /not a regular file/,
    );
    assert.throws(
      () => readBoundedUtf8File(path.join(directory, "absent.md"), {
        maxBytes: 1024,
        rejectControlArtifacts: true,
      }),
      /does not exist/,
    );
  });
});

test("bounded JSON reads reject invalid JSON and non-object roots", async () => {
  await withDirectory("nighty-bounded-", async (directory) => {
    const invalid = path.join(directory, "invalid.json");
    writeFileSync(invalid, "{not json}");

    assert.throws(
      () => readBoundedJsonFile(invalid, { maxBytes: 1024 }),
      /not valid JSON/,
    );
    const valid = path.join(directory, "valid.json");
    writeFileSync(valid, JSON.stringify({ ok: true }));
    assert.deepEqual(readBoundedJsonFile(valid, { maxBytes: 1024 }), { ok: true });
    const array = path.join(directory, "array.json");
    writeFileSync(array, "[]");
    assert.throws(
      () => readBoundedJsonFile(array, { maxBytes: 1024, requireObject: true }),
      /must decode to an object/,
    );
  });
});
