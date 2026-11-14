import { spawnSync } from "node:child_process";
import path from "node:path";

import type { LeaseRecord, StateStore } from "./state-store.ts";

export type RecoveryCleanupEvidence = {
  verified: boolean;
  failures: string[];
};

export type RecoveryOutcome = {
  runId: string;
  taskId: string;
  status: "cleaned" | "retry_required";
  evidence: RecoveryCleanupEvidence;
};

type RecordedIdentity = {
  pid: number;
  startedAt: string;
  executable: string;
};

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function helperEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "SystemDrive", "windir", "TEMP", "TMP", "PATHEXT", "COMSPEC"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function canonicalExecutable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function inspectWindowsProcess(pid: number): { executable: string; startedAt: string } | null {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
    "if ($null -eq $p) { exit 3 }",
    "$o = [pscustomobject]@{ executable = $p.ExecutablePath; startedAt = $p.CreationDate.ToUniversalTime().ToString('o') }",
    "$o | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
    env: helperEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 3) return null;
  if (result.status !== 0 || result.error) {
    throw new Error("could not inspect recorded process identity");
  }
  const parsed = JSON.parse(result.stdout) as { executable?: unknown; startedAt?: unknown };
  if (typeof parsed.executable !== "string" || typeof parsed.startedAt !== "string") {
    throw new Error("recorded process identity is incomplete");
  }
  return { executable: parsed.executable, startedAt: parsed.startedAt };
}

export async function cleanupRecordedProcess(identity: RecordedIdentity): Promise<RecoveryCleanupEvidence> {
  if (!isPidAlive(identity.pid)) return { verified: true, failures: [] };
  if (process.platform !== "win32") {
    return { verified: false, failures: ["process identity cleanup is only implemented for the Windows runner"] };
  }
  let observed: { executable: string; startedAt: string } | null;
  try {
    observed = inspectWindowsProcess(identity.pid);
  } catch (error) {
    return { verified: false, failures: [error instanceof Error ? error.message : String(error)] };
  }
  if (observed === null) return { verified: true, failures: [] };
  const startDelta = Math.abs(Date.parse(observed.startedAt) - Date.parse(identity.startedAt));
  if (
    canonicalExecutable(observed.executable) !== canonicalExecutable(identity.executable)
    || !Number.isFinite(startDelta)
    || startDelta > 15_000
  ) {
    return { verified: false, failures: ["recorded PID no longer matches its executable/start identity"] };
  }
  const result = spawnSync("taskkill.exe", ["/PID", String(identity.pid), "/T", "/F"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
    env: helperEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const failures: string[] = [];
  if (result.error) failures.push("taskkill failed: " + result.error.message);
  if (result.status !== 0 && isPidAlive(identity.pid)) failures.push("taskkill exited " + String(result.status));
  const deadline = Date.now() + 5_000;
  while (isPidAlive(identity.pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (isPidAlive(identity.pid)) failures.push("owned process remains alive after cleanup");
  return { verified: failures.length === 0, failures };
}

function identityFromLease(lease: LeaseRecord): RecordedIdentity | null {
  return lease.pid !== null && lease.processStartedAt !== null && lease.processExecutable !== null
    ? { pid: lease.pid, startedAt: lease.processStartedAt, executable: lease.processExecutable }
    : null;
}

export async function recoverAbandonedProcesses(input: {
  state: StateStore;
  cleanup?: (identity: RecordedIdentity) => Promise<RecoveryCleanupEvidence>;
}): Promise<RecoveryOutcome[]> {
  const cleanup = input.cleanup ?? cleanupRecordedProcess;
  const outcomes: RecoveryOutcome[] = [];
  for (const task of input.state.listTasks()) {
    const lease = input.state.getLease(task.taskId);
    if (!lease) continue;
    const run = input.state.getRun(lease.runId);
    if (!run || run.state !== "RUNNING") continue;
    const identity = identityFromLease(lease);
    const evidence = identity
      ? await cleanup(identity)
      : { verified: false, failures: ["owned process identity is incomplete"] };
    if (!evidence.verified) {
      input.state.recordCleanupFailure(lease.runId, evidence.failures.join("; "));
      outcomes.push({ runId: lease.runId, taskId: task.taskId, status: "retry_required", evidence });
      continue;
    }
    input.state.finishRun(lease.runId, { state: "FAILED", exitCode: null, timedOut: false });
    const current = input.state.getTask(task.taskId);
    if (current?.state === "IN_DEVELOPMENT" || current?.state === "UNDER_REVIEW") {
      input.state.transition(task.taskId, current.state, "EXECUTION_FAILED", "abandoned provider process cleaned after runner restart", {
        expectedRevision: current.revision,
      });
    }
    outcomes.push({ runId: lease.runId, taskId: task.taskId, status: "cleaned", evidence });
  }
  return outcomes;
}
