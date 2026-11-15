import { execFileSync } from "node:child_process";

import {
  canonicalJson,
  inspectGit,
  resolveGitExecutable,
  type GitInspection,
} from "./git-gate.ts";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

function environment(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of [
    "PATH", "SystemRoot", "SystemDrive", "windir", "TEMP", "TMP",
    "USERPROFILE", "HOME", "PATHEXT", "COMSPEC",
  ]) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
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
      env: environment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

export type GitCheckpointOptions = {
  root: string;
  commit?: (message: string) => void;
};

export class GitCheckpoint {
  readonly #options: GitCheckpointOptions;

  constructor(options: GitCheckpointOptions) {
    this.#options = options;
  }

  assertCleanBaseline(): GitInspection {
    const observed = inspectGit(this.#options.root);
    if (observed.inventory.length > 0) {
      throw new Error("task dispatch requires a clean source baseline");
    }
    if (git(this.#options.root, ["diff", "--cached", "--name-only"]).length > 0) {
      throw new Error("task dispatch requires an empty Git index");
    }
    return observed;
  }

  commit(input: { taskId: string; approved: GitInspection }): { commit: string } {
    if (!/^TASK-[0-9]{3}$/.test(input.taskId)) throw new Error("invalid task identity");
    const observed = inspectGit(this.#options.root);
    if (observed.branch !== input.approved.branch) throw new Error("branch changed after approval");
    if (observed.head !== input.approved.head) throw new Error("head changed after approval");
    if (
      observed.sourceSha256 !== input.approved.sourceSha256
      || observed.inventorySha256 !== input.approved.inventorySha256
      || canonicalJson(observed.inventory) !== canonicalJson(input.approved.inventory)
    ) {
      throw new Error("approved source changed before checkpoint");
    }
    if (observed.inventory.length === 0) throw new Error("approved source has no changes to checkpoint");
    if (git(this.#options.root, ["diff", "--cached", "--name-only"]).length > 0) {
      throw new Error("Git index is not empty before checkpoint");
    }

    const approvedPaths = observed.inventory.map((entry) => entry.path).sort();
    git(this.#options.root, ["add", "--", ...approvedPaths]);
    const stagedPaths = git(this.#options.root, ["diff", "--cached", "--name-only"])
      .split(/\r?\n/)
      .filter((entry) => entry.length > 0)
      .sort();
    if (canonicalJson(stagedPaths) !== canonicalJson(approvedPaths)) {
      throw new Error("staged inventory does not match the approved inventory");
    }

    const message = "feat(" + input.taskId.toLowerCase() + "): checkpoint approved changes";
    if (this.#options.commit) {
      this.#options.commit(message);
    } else {
      git(this.#options.root, [
        "-c", "core.hooksPath=NUL",
        "commit", "--no-gpg-sign", "-m", message,
      ]);
    }
    const commit = git(this.#options.root, ["rev-parse", "HEAD"]);
    if (!/^[0-9a-f]{40}$/.test(commit) || commit === input.approved.head) {
      throw new Error("Git checkpoint did not create a new commit");
    }
    return { commit };
  }
}
