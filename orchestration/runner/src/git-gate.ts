import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  lstatSync,
  openSync,
  readSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";

export type GitInventoryEntry = {
  path: string;
  status: string;
  digest: string | null;
};

export type GitInspection = {
  branch: string;
  head: string;
  headTree: string;
  clean: boolean;
  changes: string[];
  inventory: GitInventoryEntry[];
  inventorySha256: string;
  sourceSha256: string;
};

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Runner-owned control artifacts change while a review is being produced and
 * are therefore excluded from the source inventory that an approval binds.
 * Task documents are immutable inputs and are likewise not developer source.
 */
const CONTROL_PATH_PREFIXES = [
  "orchestration/deliveries/",
  "orchestration/reviews/",
  "orchestration/status/",
  "orchestration/quarantine/",
  "orchestration/logs/",
  "orchestration/archive/",
  "orchestration/tasks/",
];

function isControlPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return CONTROL_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function resolveGitExecutable(): string {
  return process.env.NIGHTY_GIT_EXECUTABLE?.trim() || "git";
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function gitEnvironment(): Record<string, string> {
  const allowed = [
    "PATH",
    "SystemRoot",
    "SystemDrive",
    "windir",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "PATHEXT",
    "COMSPEC",
  ];
  const environment: Record<string, string> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function git(root: string, args: string[]): string {
  return execFileSync(
    resolveGitExecutable(),
    ["-c", "core.quotePath=false", ...args],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      env: gitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function hashFile(filePath: string): string {
  const descriptor = openSync(filePath, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const read = readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

function resolveInsideRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Git reported a path outside the repository: " + relativePath);
  }
  return resolved;
}

function worktreeDigest(root: string, relativePath: string): string | null {
  const absolute = resolveInsideRoot(root, relativePath);
  let stats;
  try {
    stats = lstatSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    return sha256("symlink\0" + readlinkSync(absolute));
  }
  if (stats.isFile()) return hashFile(absolute);
  if (stats.isDirectory()) return sha256("directory");
  return sha256("special");
}

function parseInventory(root: string, status: string): GitInventoryEntry[] {
  const entries: GitInventoryEntry[] = [];
  for (const line of status.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const match = /^(..) (.*)$/s.exec(line);
    if (!match) throw new Error("unrecognized Git status line: " + line);
    const relativePath = match[2] as string;
    if (isControlPath(relativePath)) continue;
    entries.push({
      path: relativePath,
      status: match[1] as string,
      digest: worktreeDigest(root, relativePath),
    });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectGit(root: string): GitInspection {
  const branch = git(root, ["branch", "--show-current"]).trim();
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const headTree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
  const status = git(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--no-renames",
  ]);
  const changes = status.split(/\r?\n/).filter((line) => line.length > 0);
  const inventory = parseInventory(root, status);
  return {
    branch,
    head,
    headTree,
    clean: changes.length === 0,
    changes,
    inventory,
    inventorySha256: sha256(canonicalJson(inventory)),
    sourceSha256: sha256(canonicalJson({ head, headTree, inventory })),
  };
}

export function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync(
      resolveGitExecutable(),
      ["merge-base", "--is-ancestor", ancestor, descendant],
      {
        cwd: root,
        windowsHide: true,
        env: gitEnvironment(),
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    return true;
  } catch {
    return false;
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => canonicalJson(entry)).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

export function assertCheckpointAllowed(input: {
  decision: "APPROVED" | "CHANGES_REQUIRED" | "BLOCKED";
  reviewedDeliveryDigest: string;
  currentDeliveryDigest: string;
}): void {
  if (input.decision !== "APPROVED") {
    throw new Error("checkpoint requires APPROVED review");
  }
  if (input.reviewedDeliveryDigest !== input.currentDeliveryDigest) {
    throw new Error("delivery digest changed after review");
  }
}
