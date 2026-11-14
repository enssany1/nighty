import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

export type ProcessRequest = {
  executable: string;
  args: string[];
  cwd: string;
  allowedExecutables: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  environment: Record<string, string>;
};

export type ProcessResult = {
  runId: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

function canonicalExecutable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export async function runOwnedProcess(request: ProcessRequest): Promise<ProcessResult> {
  const allowed = new Set(request.allowedExecutables.map(canonicalExecutable));
  if (!allowed.has(canonicalExecutable(request.executable))) {
    throw new Error("executable is not allowlisted: " + request.executable);
  }
  if (request.timeoutMs < 1 || request.maxOutputBytes < 1) {
    throw new Error("timeout and output limit must be positive");
  }

  const runId = randomUUID();
  const started = Date.now();
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let timedOut = false;
    let outputError: Error | undefined;

    const collect = (target: Buffer[], chunk: Buffer): void => {
      if (outputError) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > request.maxOutputBytes) {
        outputError = new Error("process output exceeded " + request.maxOutputBytes + " bytes");
        child.kill();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, request.timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (outputError) {
        reject(outputError);
        return;
      }
      resolve({
        runId,
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}
