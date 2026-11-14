import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

export type ProcessStartIdentity = {
  runId: string;
  rootPid: number;
  startedAt: string;
  /** Exact allowlisted executable requested for this owned process. */
  executable?: string;
};

export type ProcessRequest = {
  executable: string;
  args: string[];
  cwd: string;
  allowedExecutables: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  environment: Record<string, string>;
  stdin?: string;
  /** Upper bound for terminating and verifying the whole process family. */
  cleanupTimeoutMs?: number;
  /** Redacts explicit credential values from captured output. */
  redact?: (text: string) => string;
  /**
   * Synchronous ownership callback invoked immediately after the root process
   * starts, before stdin or timers are activated. Throwing fails closed and
   * terminates the whole owned family.
   */
  onStarted?: (identity: ProcessStartIdentity) => void;
};

export type CleanupStrategy =
  | "taskkill-tree"
  | "posix-process-group"
  | "direct-child";

export type CleanupEvidence = {
  attempted: true;
  strategy: CleanupStrategy;
  rootPid: number;
  /** PIDs this supervisor can prove it owned: root plus observed descendants. */
  candidatePids: number[];
  signalledPids: number[];
  remainingPids: number[];
  ignoredHelperPids: number[];
  verified: boolean;
  deadlineExceeded: boolean;
  durationMs: number;
  failures: string[];
};

export type ProcessResult = {
  runId: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  rootPid: number;
  cleanup: CleanupEvidence | null;
};

export class ProcessOutputLimitError extends Error {
  readonly cleanup: CleanupEvidence | null;

  constructor(message: string, cleanup: CleanupEvidence | null) {
    super(message);
    this.name = "ProcessOutputLimitError";
    this.cleanup = cleanup;
  }
}

export class ProcessOwnershipError extends Error {
  readonly cleanup: CleanupEvidence | null;

  constructor(message: string, cleanup: CleanupEvidence | null) {
    super(message);
    this.name = "ProcessOwnershipError";
    this.cleanup = cleanup;
  }
}

export class ProcessCleanupError extends Error {
  readonly cleanup: CleanupEvidence;

  constructor(message: string, cleanup: CleanupEvidence) {
    super(message);
    this.name = "ProcessCleanupError";
    this.cleanup = cleanup;
  }
}

type ProcessEntry = {
  pid: number;
  parentPid: number;
  name: string;
};

const IGNORED_HELPER_NAMES = new Set(["conhost.exe", "openconsole.exe", "conhost"]);

function canonicalExecutable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reportedPids(output: string): number[] {
  const pids: number[] = [];
  // Match only the terminated process, never the "child process of PID X"
  // parent reference that taskkill includes in the same sentence.
  for (const match of output.matchAll(/process with PID\s+(\d+)/gi)) {
    const pid = Number(match[1]);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return pids;
}

function helperEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    PATH: process.env.PATH ?? "C:\\Windows\\System32",
    PATHEXT: process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM",
  };
  for (const key of ["windir", "COMSPEC", "TEMP", "TMP"]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

/**
 * Reads the Windows process table through a fixed, non-agent-controlled
 * PowerShell query. Only numeric PIDs are interpolated into the script.
 */
function parseProcessTable(stdout: string): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\d+)\|(\d+)\|(.+)$/.exec(line.trim());
    if (!match) continue;
    entries.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: (match[3] as string).toLowerCase(),
    });
  }
  return entries;
}

const PROCESS_TABLE_SCRIPT = [
  "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name |",
  'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)" }',
].join(" ");

function snapshotWindowsProcesses(timeoutMs: number): {
  entries: ProcessEntry[];
  failure: string | null;
} {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PROCESS_TABLE_SCRIPT],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: Math.max(1, timeoutMs),
      env: helperEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const entries = parseProcessTable(result.stdout ?? "");
  const failure = result.error
    ? "process table query failed: " + result.error.message
    : entries.length === 0
      ? "process table query returned no rows"
      : null;
  return { entries, failure };
}

function snapshotWindowsProcessesAsync(timeoutMs: number): Promise<{
  entries: ProcessEntry[];
  failure: string | null;
}> {
  return new Promise((resolve) => {
    const process = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PROCESS_TABLE_SCRIPT],
      {
        windowsHide: true,
        env: helperEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let settled = false;
    const finish = (failure: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const entries = failure === null ? parseProcessTable(stdout) : [];
      resolve({
        entries,
        failure: failure ?? (entries.length === 0 ? "process table query returned no rows" : null),
      });
    };
    const timer = setTimeout(() => {
      try {
        process.kill();
      } catch {
        // The query may already have exited.
      }
      finish("process table query timed out");
    }, Math.max(1, timeoutMs));
    process.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    process.once("error", (error) => finish("process table query failed: " + error.message));
    process.once("close", (code) => {
      finish(code === 0 ? null : "process table query exited with status " + String(code));
    });
  });
}

function descendantEntries(rootPid: number, entries: ProcessEntry[]): ProcessEntry[] {
  const byParent = new Map<number, ProcessEntry[]>();
  for (const entry of entries) {
    const list = byParent.get(entry.parentPid) ?? [];
    list.push(entry);
    byParent.set(entry.parentPid, list);
  }
  const found: ProcessEntry[] = [];
  const queue = [rootPid];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const parent = queue.shift() as number;
    if (visited.has(parent)) continue;
    visited.add(parent);
    for (const child of byParent.get(parent) ?? []) {
      found.push(child);
      queue.push(child.pid);
    }
  }
  return found;
}

function lookupProcessNames(pids: number[], timeoutMs: number): Map<number, string> {
  const names = new Map<number, string>();
  const safePids = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  if (safePids.length === 0) return names;
  const script = [
    "$ids = @(" + safePids.join(",") + ");",
    "Get-Process -Id $ids -ErrorAction SilentlyContinue |",
    'ForEach-Object { "$($_.Id)|$($_.ProcessName)" }',
  ].join(" ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: Math.max(1, timeoutMs),
      env: helperEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const match = /^(\d+)\|(.+)$/.exec(line.trim());
    if (!match) continue;
    names.set(Number(match[1]), (match[2] as string).toLowerCase());
  }
  return names;
}

async function terminateOwnedFamily(input: {
  rootPid: number;
  child: ReturnType<typeof spawn>;
  cleanupTimeoutMs: number;
  knownDescendants: number[];
}): Promise<CleanupEvidence> {
  const started = Date.now();
  const deadline = started + input.cleanupTimeoutMs;
  const candidates = new Set<number>([input.rootPid]);
  for (const pid of input.knownDescendants) {
    if (Number.isInteger(pid) && pid > 0) candidates.add(pid);
  }
  const signalled = new Set<number>();
  const ignored = new Set<number>();
  const failures: string[] = [];
  let strategy: CleanupStrategy;
  let deadlineExceeded = false;

  if (process.platform === "win32") {
    strategy = "taskkill-tree";
    // Capture owned descendants before the tree is torn down so evidence is
    // available even if taskkill fails. Console hosts are OS helpers shared
    // with the terminal and are not part of the workload being cleaned.
    const snapshot = snapshotWindowsProcesses(Math.max(1, Math.min(2_000, deadline - Date.now())));
    if (snapshot.failure !== null) failures.push(snapshot.failure);
    for (const entry of descendantEntries(input.rootPid, snapshot.entries)) {
      if (IGNORED_HELPER_NAMES.has(entry.name)) ignored.add(entry.pid);
      else candidates.add(entry.pid);
    }

    // The root may already have exited. Kill every still-live candidate as a
    // tree root so descendants of a surviving grandchild are also covered.
    const targets = [...candidates].filter((pid) => pid !== input.rootPid && !ignored.has(pid) && isPidAlive(pid));
    if (isPidAlive(input.rootPid)) targets.unshift(input.rootPid);
    for (const target of targets) {
      const remainingBudget = Math.max(1, Math.min(2_000, deadline - Date.now()));
      const result = spawnSync(
        "taskkill.exe",
        ["/PID", String(target), "/T", "/F"],
        {
          windowsHide: true,
          encoding: "utf8",
          timeout: remainingBudget,
          env: helperEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const output = (result.stdout ?? "") + "\n" + (result.stderr ?? "");
      for (const pid of reportedPids(output)) {
        if (ignored.has(pid)) continue;
        candidates.add(pid);
        if (result.status === 0) signalled.add(pid);
      }
      if (result.error) {
        failures.push("taskkill could not run for " + target + ": " + result.error.message);
      }
      if (result.status === 0) signalled.add(target);
    }
    if (targets.length > 0 && ![...targets].some((pid) => signalled.has(pid))) {
      failures.push("taskkill did not report a terminated owned process");
      try {
        input.child.kill("SIGKILL");
        signalled.add(input.rootPid);
      } catch (error) {
        failures.push("direct child kill failed: " + String(error));
      }
    }
  } else {
    strategy = "posix-process-group";
    try {
      process.kill(-input.rootPid, "SIGKILL");
      signalled.add(input.rootPid);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ESRCH") failures.push("process-group kill failed: " + String(error));
      try {
        input.child.kill("SIGKILL");
        signalled.add(input.rootPid);
      } catch (secondaryError) {
        failures.push("direct child kill failed: " + String(secondaryError));
      }
    }
  }

  let remaining = [...candidates].filter(isPidAlive);
  while (remaining.length > 0 && Date.now() < deadline) {
    await sleep(25);
    remaining = [...candidates].filter(isPidAlive);
  }
  if (remaining.length > 0 && process.platform === "win32") {
    // A console host can outlive the workload it was attached to; classify it
    // explicitly instead of reporting a false cleanup failure.
    const names = lookupProcessNames(remaining, Math.max(1, Math.min(1_000, deadline - Date.now())));
    const realRemaining: number[] = [];
    for (const pid of remaining) {
      const name = names.get(pid);
      if (name !== undefined && IGNORED_HELPER_NAMES.has(name)) ignored.add(pid);
      else realRemaining.push(pid);
    }
    if (realRemaining.length > 0) {
      failures.push(
        "remaining process names: " +
          realRemaining.map((pid) => pid + "=" + (names.get(pid) ?? "unknown")).join(","),
      );
    }
    remaining = realRemaining;
  }
  if (remaining.length > 0 && Date.now() >= deadline) deadlineExceeded = true;
  if (remaining.length > 0) {
    failures.push("processes still alive after cleanup: " + remaining.join(","));
  }

  return {
    attempted: true,
    strategy,
    rootPid: input.rootPid,
    candidatePids: [...candidates],
    signalledPids: [...signalled],
    remainingPids: remaining,
    ignoredHelperPids: [...ignored],
    verified: remaining.length === 0,
    deadlineExceeded,
    durationMs: Date.now() - started,
    failures,
  };
}

export async function runOwnedProcess(request: ProcessRequest): Promise<ProcessResult> {
  const allowed = new Set(request.allowedExecutables.map(canonicalExecutable));
  if (!allowed.has(canonicalExecutable(request.executable))) {
    throw new Error("executable is not allowlisted: " + request.executable);
  }
  if (request.timeoutMs < 1 || request.maxOutputBytes < 1) {
    throw new Error("timeout and output limit must be positive");
  }
  const cleanupTimeoutMs = request.cleanupTimeoutMs ?? 5_000;
  if (!Number.isInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1) {
    throw new Error("cleanup timeout must be a positive integer");
  }
  const redact = request.redact ?? ((text: string): string => text);

  const runId = randomUUID();
  const started = Date.now();
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.environment,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const rootPid = child.pid ?? 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let ownershipError: Error | null = null;
    let cleanupPromise: Promise<CleanupEvidence> | null = null;
    const trackedDescendants = new Map<number, string>();
    let monitoring = process.platform === "win32";
    let monitorTimer: NodeJS.Timeout | null = null;
    let monitorPromise: Promise<void> | null = null;

    const stopMonitor = (): void => {
      monitoring = false;
      if (monitorTimer !== null) {
        clearTimeout(monitorTimer);
        monitorTimer = null;
      }
    };

    const beginCleanup = (): Promise<CleanupEvidence> => {
      cleanupPromise ??= terminateOwnedFamily({
        rootPid,
        child,
        cleanupTimeoutMs,
        knownDescendants: [...trackedDescendants.keys()],
      });
      return cleanupPromise;
    };

    if (process.platform === "win32") {
      const pollDescendants = (): void => {
        if (!monitoring) return;
        monitorPromise = (async () => {
          const snapshot = await snapshotWindowsProcessesAsync(1_500);
          if (!monitoring) return;
          if (snapshot.failure === null) {
            for (const entry of descendantEntries(rootPid, snapshot.entries)) {
              if (!IGNORED_HELPER_NAMES.has(entry.name)) {
                trackedDescendants.set(entry.pid, entry.name);
              }
            }
          }
          if (monitoring) monitorTimer = setTimeout(pollDescendants, 250);
        })();
      };
      monitorTimer = setTimeout(pollDescendants, 150);
    }

    const collect = (target: Buffer[], chunk: Buffer): void => {
      if (outputExceeded) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > request.maxOutputBytes) {
        outputExceeded = true;
        void beginCleanup();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.stdin.on("error", () => {
      // A process that exits before consuming stdin is handled by exit status.
    });

    try {
      request.onStarted?.({
        runId,
        rootPid,
        startedAt: new Date().toISOString(),
        executable: path.resolve(request.executable),
      });
    } catch (error) {
      ownershipError = error instanceof Error ? error : new Error(String(error));
      void beginCleanup();
    }

    if (ownershipError === null) {
      child.stdin.end(request.stdin ?? "");
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      void beginCleanup();
    }, request.timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      stopMonitor();
      void (async () => {
        if (monitorPromise !== null) await monitorPromise;
        const liveTracked = [...trackedDescendants.keys()].filter(isPidAlive);
        const groupAlive =
          process.platform !== "win32"
          && (() => {
            try {
              process.kill(-rootPid, 0);
              return true;
            } catch (error) {
              return (error as NodeJS.ErrnoException).code === "EPERM";
            }
          })();
        if (cleanupPromise === null && (liveTracked.length > 0 || groupAlive)) {
          void beginCleanup();
        }
        const cleanup = cleanupPromise ? await cleanupPromise : null;
        const safeCleanup =
          cleanup === null
            ? null
            : {
                ...cleanup,
                failures: cleanup.failures.map((failure) => redact(failure)),
              };
        if (outputExceeded) {
          reject(
            new ProcessOutputLimitError(
              "process output exceeded " + request.maxOutputBytes + " bytes",
              safeCleanup,
            ),
          );
          return;
        }
        if (ownershipError !== null) {
          reject(
            new ProcessOwnershipError(
              "provider process ownership recording failed: " + ownershipError.message,
              safeCleanup,
            ),
          );
          return;
        }
        if (!timedOut && safeCleanup !== null && !safeCleanup.verified) {
          reject(
            new ProcessCleanupError(
              "owned process family remained alive after normal exit",
              safeCleanup,
            ),
          );
          return;
        }
        resolve({
          runId,
          exitCode,
          signal,
          stdout: redact(Buffer.concat(stdout).toString("utf8")),
          stderr: redact(Buffer.concat(stderr).toString("utf8")),
          timedOut,
          durationMs: Date.now() - started,
          rootPid,
          cleanup: safeCleanup,
        });
      })();
    });
  });
}
