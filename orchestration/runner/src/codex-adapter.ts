import { existsSync, rmSync } from "node:fs";

import { readBoundedUtf8File, assertPathInsideProject } from "./bounded-io.ts";
import {
  runOwnedProcess,
  type ProcessResult,
  type ProcessStartIdentity,
} from "./process-supervisor.ts";
import { SecretRedactor } from "./redaction.ts";
import { loadSchemaFile, validateStructuredResult } from "./schema.ts";

export type CodexAdapterOptions = {
  executable: string;
  baseArgs?: string[];
  projectRoot: string;
  environment: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  maxPromptBytes?: number;
  maxSchemaBytes?: number;
  redactor?: SecretRedactor;
  onProcessStarted?: (identity: ProcessStartIdentity) => void;
};

const DEFAULT_MAX_PROMPT_BYTES = 1_000_000;
const DEFAULT_MAX_SCHEMA_BYTES = 256 * 1024;

export class CodexAdapter {
  readonly #options: CodexAdapterOptions;

  constructor(options: CodexAdapterOptions) {
    this.#options = options;
  }

  async run(input: {
    prompt: string;
    outputSchemaPath: string;
    outputPath: string;
    onProcessStarted?: (identity: ProcessStartIdentity) => void;
  }): Promise<{ output: Record<string, unknown>; process: ProcessResult }> {
    const redactor = this.#options.redactor ?? new SecretRedactor([]);
    const maxPromptBytes = this.#options.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
    const maxSchemaBytes = this.#options.maxSchemaBytes ?? DEFAULT_MAX_SCHEMA_BYTES;
    const onProcessStarted = input.onProcessStarted ?? this.#options.onProcessStarted;

    const schemaPath = assertPathInsideProject(
      this.#options.projectRoot,
      input.outputSchemaPath,
      "output schema path",
    );
    const outputPath = assertPathInsideProject(
      this.#options.projectRoot,
      input.outputPath,
      "structured output path",
    );

    if (Buffer.byteLength(input.prompt, "utf8") > maxPromptBytes) {
      throw new Error("Codex prompt exceeds the " + maxPromptBytes + "-byte limit");
    }
    const schema = loadSchemaFile(schemaPath, { maxBytes: maxSchemaBytes });
    rmSync(outputPath, { force: true });
    const args = [
      ...(this.#options.baseArgs ?? []),
      "exec",
      "--json",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
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
      redact: (text: string): string => redactor.redact(text),
      ...(onProcessStarted !== undefined ? { onStarted: onProcessStarted } : {}),
    });
    if (processResult.timedOut) throw new Error("Codex invocation timed out");
    if (processResult.exitCode !== 0) {
      const detail = processResult.stderr.trim().slice(0, 2_000);
      throw new Error(
        redactor.redact(
          "Codex invocation failed with exit code " +
            processResult.exitCode +
            (detail.length > 0 ? ": " + detail : ""),
        ),
      );
    }
    if (!existsSync(outputPath)) {
      throw new Error("Codex structured output was not created");
    }
    const text = readBoundedUtf8File(outputPath, {
      maxBytes: this.#options.maxOutputBytes,
      rejectControlArtifacts: true,
    });
    try {
      redactor.assertAbsent(text, "Codex structured output");
    } catch (error) {
      rmSync(outputPath, { force: true });
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Codex structured output is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Codex structured output must be an object");
    }
    validateStructuredResult(parsed, schema, "Codex structured output");
    return { output: parsed as Record<string, unknown>, process: processResult };
  }
}
