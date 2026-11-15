import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assertControlArtifactPath, readBoundedUtf8File } from "./bounded-io.ts";

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
  options: { maxBytes?: number; rename?: (from: string, to: string) => void } = {},
): PublishResult {
  if (path.basename(finalName) !== finalName || !finalName.endsWith(".md")) {
    throw new Error("invalid artifact filename");
  }
  if (
    options.maxBytes !== undefined
    && Buffer.byteLength(contents, "utf8") > options.maxBytes
  ) {
    throw new Error("artifact exceeds the " + options.maxBytes + "-byte limit");
  }
  assertControlArtifactPath(directory);
  const finalPath = path.join(directory, finalName);
  const sha256 = digest(contents);
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (existsSync(finalPath)) {
    if (digest(readBoundedUtf8File(finalPath, {
      maxBytes,
      rejectControlArtifacts: true,
    })) === sha256) {
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
    validate(readBoundedUtf8File(temporaryPath, {
      maxBytes,
      rejectControlArtifacts: true,
    }));
    (options.rename ?? renameSync)(temporaryPath, finalPath);
    return { status: "published", sha256, path: finalPath };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function discoverArtifacts(directory: string): string[] {
  if (!existsSync(directory)) return [];
  assertControlArtifactPath(directory);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && name.endsWith(".md") && !name.endsWith(".tmp"))
    .sort();
}

export type QuarantineResult = {
  quarantinedPath: string;
  metadataPath: string;
};

/**
 * Moves a conflicting or invalid control artifact out of the live inbox and
 * records a bounded, secret-free metadata sidecar. The original is never
 * processed after quarantine.
 */
export function quarantineArtifact(input: {
  directory: string;
  name: string;
  quarantineDirectory: string;
  reason: string;
  expectedDigest?: string;
  actualDigest?: string;
}): QuarantineResult {
  if (path.basename(input.name) !== input.name || !input.name.endsWith(".md")) {
    throw new Error("invalid artifact filename");
  }
  assertControlArtifactPath(input.directory);
  const source = path.join(input.directory, input.name);
  if (!existsSync(source)) throw new Error("artifact does not exist: " + input.name);
  const sourceStats = lstatSync(source);
  if (sourceStats.isSymbolicLink()) {
    throw new Error("artifact is a symbolic link or reparse point: " + input.name);
  }
  if (!sourceStats.isFile()) throw new Error("artifact is not a regular file: " + input.name);

  mkdirSync(input.quarantineDirectory, { recursive: true });
  assertControlArtifactPath(input.quarantineDirectory);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = stamp + "." + randomUUID();
  const quarantinedPath = path.join(
    input.quarantineDirectory,
    input.name + "." + suffix + ".quarantine",
  );
  const metadataPath = quarantinedPath + ".json";
  try {
    renameSync(source, quarantinedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      copyFileSync(source, quarantinedPath, constants.COPYFILE_EXCL);
      rmSync(source, { force: true });
    } else {
      throw error;
    }
  }
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        schema: "nighty.quarantine/v1",
        artifact: input.name,
        reason: input.reason,
        expectedDigest: input.expectedDigest ?? null,
        actualDigest: input.actualDigest ?? null,
        quarantinedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", encoding: "utf8" },
  );
  return { quarantinedPath, metadataPath };
}
