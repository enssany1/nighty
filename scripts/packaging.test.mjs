import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Linux container entrypoints use LF line endings", async () => {
  const entrypoint = await readFile(new URL("../docker/api-entrypoint.sh", import.meta.url));

  assert.equal(entrypoint.includes(Buffer.from("\r\n")), false);
});
