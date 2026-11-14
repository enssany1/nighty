import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import path from "node:path";

export type BoundedReadOptions = {
  maxBytes: number;
  /**
   * Control artifacts (tasks, deliveries, reviews, schemas, projections) must
   * not be read through junctions, symlinks, or other reparse points.
   */
  rejectControlArtifacts?: boolean;
};

export type BoundedJsonOptions = BoundedReadOptions & {
  requireObject?: boolean;
};

export type BoundedReadErrorCode =
  | "missing"
  | "reparse_point"
  | "not_regular_file"
  | "too_large"
  | "invalid_utf8"
  | "invalid_json";

export class BoundedReadError extends Error {
  readonly code: BoundedReadErrorCode;
  readonly filePath: string;

  constructor(code: BoundedReadErrorCode, filePath: string, message: string) {
    super(message);
    this.name = "BoundedReadError";
    this.code = code;
    this.filePath = filePath;
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rejects a path whose existing leaf or any existing ancestor is a symbolic
 * link or reparse point. Node exposes junctions as symbolic links on Windows,
 * which covers the control-artifact boundary this runner relies on. Other
 * exotic reparse tags are not distinguishable from ordinary directories via
 * the Node filesystem API and remain a documented limitation.
 */
export function assertControlArtifactPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  let current = resolved;
  for (;;) {
    let stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // Missing components are allowed: publication creates them later. Any
        // existing ancestor is still checked for a reparse point.
        const parent = path.dirname(current);
        if (parent === current) return;
        current = parent;
        continue;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new BoundedReadError(
        "reparse_point",
        resolved,
        "control artifact path traverses a symbolic link or reparse point: " + current,
      );
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function assertRegularLeaf(filePath: string, rejectControlArtifacts: boolean): number {
  let stats;
  try {
    stats = lstatSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new BoundedReadError("missing", filePath, "file does not exist: " + filePath);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new BoundedReadError(
      "reparse_point",
      filePath,
      "control artifact path traverses a symbolic link or reparse point: " + filePath,
    );
  }
  if (!stats.isFile()) {
    throw new BoundedReadError(
      "not_regular_file",
      filePath,
      "file is not a regular file: " + filePath,
    );
  }
  if (rejectControlArtifacts) assertControlArtifactPath(filePath);
  return stats.size;
}

export function readBoundedBytes(
  filePath: string,
  options: BoundedReadOptions,
): Buffer {
  if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer");
  }
  const resolved = path.resolve(filePath);
  const rejectControlArtifacts = options.rejectControlArtifacts === true;
  // The size is checked from metadata before any allocation for the file body.
  const declaredSize = assertRegularLeaf(resolved, rejectControlArtifacts);
  if (declaredSize > options.maxBytes) {
    throw new BoundedReadError(
      "too_large",
      resolved,
      "file exceeds the " + options.maxBytes + "-byte limit: " + resolved,
    );
  }

  const descriptor = openSync(resolved, "r");
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new BoundedReadError(
        "not_regular_file",
        resolved,
        "file is not a regular file: " + resolved,
      );
    }
    if (stats.size > options.maxBytes) {
      throw new BoundedReadError(
        "too_large",
        resolved,
        "file exceeds the " + options.maxBytes + "-byte limit: " + resolved,
      );
    }
    const buffer = Buffer.allocUnsafe(stats.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const read = readSync(descriptor, buffer, offset, buffer.byteLength - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    if (offset !== buffer.byteLength) {
      throw new BoundedReadError(
        "too_large",
        resolved,
        "file changed while being read: " + resolved,
      );
    }
    return buffer;
  } finally {
    closeSync(descriptor);
  }
}

export function decodeUtf8Strict(bytes: Buffer, filePath: string): string {
  try {
    return UTF8.decode(bytes);
  } catch (error) {
    throw new BoundedReadError(
      "invalid_utf8",
      filePath,
      "file is not valid UTF-8 (" + describe(error) + "): " + filePath,
    );
  }
}

export function readBoundedUtf8File(
  filePath: string,
  options: BoundedReadOptions,
): string {
  const resolved = path.resolve(filePath);
  return decodeUtf8Strict(readBoundedBytes(resolved, options), resolved);
}

export function readBoundedJsonFile(
  filePath: string,
  options: BoundedJsonOptions,
): unknown {
  const resolved = path.resolve(filePath);
  const text = readBoundedUtf8File(resolved, options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BoundedReadError(
      "invalid_json",
      resolved,
      "file content is not valid JSON: " + resolved,
    );
  }
  if (options.requireObject === true && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new BoundedReadError(
      "invalid_json",
      resolved,
      "JSON content must decode to an object: " + resolved,
    );
  }
  return parsed;
}

/**
 * Resolves a caller-supplied file path and requires it to be a strict
 * descendant of the project root. Existing ancestors (and the leaf, when it
 * exists) must not be symbolic links or reparse points. This must run before
 * any read, delete, spawn, or write of the candidate path.
 */
export function assertPathInsideProject(
  root: string,
  candidate: string,
  label: string,
): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(".." + path.sep)
    || path.isAbsolute(relative)
  ) {
    throw new Error(label + " resolves outside project root");
  }
  assertControlArtifactPath(resolved);
  return resolved;
}
