import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type PublishResult = {
  status: "published" | "duplicate";
  sha256: string;
  path: string;
};

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publishArtifact(
  directory: string,
  finalName: string,
  contents: string,
  validate: (contents: string) => void,
): PublishResult {
  if (path.basename(finalName) !== finalName || !finalName.endsWith(".md")) {
    throw new Error("invalid artifact filename");
  }
  const finalPath = path.join(directory, finalName);
  const sha256 = digest(contents);
  if (existsSync(finalPath)) {
    if (digest(readFileSync(finalPath)) === sha256) {
      return { status: "duplicate", sha256, path: finalPath };
    }
    throw new Error("conflicting artifact already exists: " + finalName);
  }

  const temporaryPath = path.join(directory, "." + finalName + "." + randomUUID() + ".tmp");
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx");
    writeFileSync(descriptor, contents, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    validate(readFileSync(temporaryPath, "utf8"));
    renameSync(temporaryPath, finalPath);
    return { status: "published", sha256, path: finalPath };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function discoverArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && name.endsWith(".md") && !name.endsWith(".tmp"))
    .sort();
}
