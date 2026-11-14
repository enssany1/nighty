import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("generated API types are current and complete", async () => {
  const result = spawnSync(process.execPath, ["scripts/generate.mjs", "--check"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = await readFile(new URL("./generated.ts", import.meta.url), "utf8");
  for (const name of ["LoginRequestDto", "CanvasResponseDto", "AuditEventResponseDto"]) {
    assert.match(generated, new RegExp(`export type ${name}\\b`));
  }
  assert.match(generated, /"\/api\/shift-instances\/\{shiftId\}\/handover"/);
});
