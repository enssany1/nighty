import { createHash } from "node:crypto";

import {
  runOwnedProcess,
  type ProcessResult,
} from "./process-supervisor.ts";

type VerificationCommand = {
  executable: string;
  args: string[];
  timeoutMs: number;
  maxOutputBytes: number;
};

export type VerificationSeal = {
  sealed: true;
  sealedAt: string;
  digest: string;
};

export type VerificationReportItem = {
  id: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  executedAt: string;
  stdoutSha256: string;
  stderrSha256: string;
};

export type VerificationReport = VerificationSeal & {
  schema: "nighty.verification/v1";
  results: VerificationReportItem[];
  completedAt: string;
  reportSha256: string;
};

type RecordedRun = {
  result: ProcessResult;
  executedAt: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function commandDigest(commands: Array<[string, Readonly<VerificationCommand>]>): string {
  const canonical = commands
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, command]) => [
      id,
      command.executable,
      command.args,
      command.timeoutMs,
      command.maxOutputBytes,
    ]);
  return sha256(JSON.stringify(canonical));
}

export class VerificationRegistry {
  readonly #commands = new Map<string, Readonly<VerificationCommand>>();
  readonly #results = new Map<string, RecordedRun>();
  #seal: VerificationSeal | null = null;

  get sealed(): boolean {
    return this.#seal !== null;
  }

  register(id: string, command: VerificationCommand): void {
    if (this.#seal !== null) {
      throw new Error("verification registry is sealed; command registration is closed");
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error("invalid verification command identifier");
    }
    if (this.#commands.has(id)) throw new Error("verification command already registered: " + id);
    this.#commands.set(id, Object.freeze({ ...command, args: [...command.args] }));
  }

  seal(): VerificationSeal {
    if (this.#seal !== null) return this.#seal;
    const sealedAt = new Date().toISOString();
    const digest = commandDigest([...this.#commands.entries()]);
    this.#seal = { sealed: true, sealedAt, digest };
    return this.#seal;
  }

  async run(
    id: string,
    cwd: string,
    environment: Record<string, string>,
  ): Promise<ProcessResult> {
    const command = this.#commands.get(id);
    if (!command) throw new Error("verification command is not registered: " + id);
    const result = await runOwnedProcess({
      executable: command.executable,
      args: [...command.args],
      cwd,
      allowedExecutables: [command.executable],
      timeoutMs: command.timeoutMs,
      maxOutputBytes: command.maxOutputBytes,
      environment,
    });
    this.#results.set(id, { result, executedAt: new Date().toISOString() });
    return result;
  }

  finalize(requiredIds?: string[]): VerificationReport {
    if (this.#seal === null) {
      throw new Error("verification registry must be sealed before finalize");
    }
    const required = requiredIds ?? [...this.#commands.keys()];
    const results: VerificationReportItem[] = [];
    for (const id of required) {
      if (!this.#commands.has(id)) {
        throw new Error("required verification command is not registered: " + id);
      }
      const recorded = this.#results.get(id);
      if (!recorded) {
        throw new Error("required verification command did not run: " + id);
      }
      if (recorded.result.exitCode !== 0 || recorded.result.timedOut) {
        throw new Error(
          "required verification command failed: " +
            id +
            " (exit " +
            String(recorded.result.exitCode) +
            (recorded.result.timedOut ? ", timed out" : "") +
            ")",
        );
      }
      results.push({
        id,
        exitCode: recorded.result.exitCode,
        timedOut: recorded.result.timedOut,
        durationMs: recorded.result.durationMs,
        executedAt: recorded.executedAt,
        stdoutSha256: sha256(recorded.result.stdout),
        stderrSha256: sha256(recorded.result.stderr),
      });
    }
    const completedAt = new Date().toISOString();
    const report = {
      schema: "nighty.verification/v1" as const,
      sealed: true as const,
      sealedAt: this.#seal.sealedAt,
      digest: this.#seal.digest,
      results,
      completedAt,
    };
    return { ...report, reportSha256: sha256(JSON.stringify(report)) };
  }
}
