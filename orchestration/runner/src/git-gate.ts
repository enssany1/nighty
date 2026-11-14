import { execFileSync } from "node:child_process";

export type GitInspection = {
  branch: string;
  head: string;
  clean: boolean;
  changes: string[];
};

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

export function inspectGit(root: string): GitInspection {
  const branch = git(root, ["branch", "--show-current"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const changes = status.length === 0 ? [] : status.split(/\r?\n/);
  return { branch, head, clean: changes.length === 0, changes };
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
