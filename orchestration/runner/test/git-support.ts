import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function gitExecutable(): string {
  return process.env.NIGHTY_GIT_EXECUTABLE?.trim() || "git";
}

export function runGit(directory: string, args: string[]): string {
  return execFileSync(gitExecutable(), args, {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

export function withGitRepository(
  run: (directory: string) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-git-"));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Nighty Test"]);
  runGit(directory, ["config", "user.email", "nighty-test@localhost"]);
  writeFileSync(path.join(directory, "README.md"), "baseline\n");
  runGit(directory, ["add", "README.md"]);
  runGit(directory, ["commit", "-m", "baseline"]);
  return Promise.resolve(run(directory)).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}
