import { existsSync, readFileSync, rmSync } from "node:fs";

import {
  runOwnedProcess,
  type ProcessResult,
} from "./process-supervisor.ts";

export type CodexAdapterOptions = {
  executable: string;
  baseArgs?: string[];
  projectRoot: string;
  environment: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
};

export class CodexAdapter {
  readonly #options: CodexAdapterOptions;

  constructor(options: CodexAdapterOptions) {
    this.#options = options;
  }

  async run(input: {
    prompt: string;
    outputSchemaPath: string;
    outputPath: string;
  }): Promise<{ output: Record<string, unknown>; process: ProcessResult }> {
    if (!existsSync(input.outputSchemaPath)) {
      throw new Error("output schema does not exist: " + input.outputSchemaPath);
    }
    rmSync(input.outputPath, { force: true });
    const args = [
      ...(this.#options.baseArgs ?? []),
      "exec",
      "--json",
      "--output-schema",
      input.outputSchemaPath,
      "-o",
      input.outputPath,
      "-C",
      this.#options.projectRoot,
      "-",
    ];
    const processResult = await runOwnedProcess({
      executable: this.#options.executable,
      args,
      cwd: this.#options.projectRoot,
      allowedExecutables: [this.#options.executable],
      timeoutMs: this.#options.timeoutMs,
      maxOutputBytes: this.#options.maxOutputBytes,
      environment: this.#options.environment,
      stdin: input.prompt,
    });
    if (processResult.timedOut) throw new Error("Codex invocation timed out");
    if (processResult.exitCode !== 0) {
      throw new Error("Codex invocation failed with exit code " + processResult.exitCode);
    }
    if (!existsSync(input.outputPath)) {
      throw new Error("Codex structured output was not created");
    }
    const parsed: unknown = JSON.parse(readFileSync(input.outputPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Codex structured output must be an object");
    }
    return { output: parsed as Record<string, unknown>, process: processResult };
  }
}
