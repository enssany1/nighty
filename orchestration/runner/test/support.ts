import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function withDirectory(
  prefix: string,
  run: (directory: string) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  return Promise.resolve(run(directory)).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}
