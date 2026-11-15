import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { publishArtifact } from "./artifact-inbox.ts";
import { assertPathInsideProject } from "./bounded-io.ts";
import { parseMarkdownArtifact } from "./markdown.ts";
import type { ProcessResult, ProcessStartIdentity } from "./process-supervisor.ts";

type StructuredAdapter = {
  run(input: {
    prompt: string;
    outputSchemaPath: string;
    outputPath: string;
    onProcessStarted?: (identity: ProcessStartIdentity) => void;
  }): Promise<{
    output: Record<string, unknown>;
    process: Pick<ProcessResult, "exitCode" | "timedOut">;
  }>;
};

export type StructuredArtifactProducerOptions = {
  projectRoot: string;
  adapter: StructuredAdapter;
  maxArtifactBytes?: number;
};

function scalar(value: unknown, key: string): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  if (
    Array.isArray(value)
    && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))
  ) {
    return JSON.stringify(value);
  }
  throw new Error("unsupported structured artifact field: " + key);
}

export function renderStructuredArtifact(output: Record<string, unknown>): string {
  const sections = output.sections;
  const sectionContent = output.section_content;
  if (!Array.isArray(sections) || !sections.every((entry) => typeof entry === "string")) {
    throw new Error("structured artifact sections must be a string array");
  }
  if (!sectionContent || typeof sectionContent !== "object" || Array.isArray(sectionContent)) {
    throw new Error("structured artifact section_content must be an object");
  }
  const content = sectionContent as Record<string, unknown>;
  const lines = ["---"];
  for (const [key, value] of Object.entries(output)) {
    if (key === "sections" || key === "section_content") continue;
    lines.push(key + ": " + scalar(value, key));
  }
  lines.push("---", "");
  for (const section of sections) {
    const body = content[section];
    if (typeof body !== "string" || body.trim().length === 0) {
      throw new Error("missing content for section: " + section);
    }
    lines.push("## " + section, "", body.trim(), "");
  }
  return lines.join("\n");
}

/**
 * Keeps model-authored JSON private to the provider run, validates it in the
 * adapter, then atomically publishes only canonical Markdown to the inbox.
 */
export class StructuredArtifactProducer {
  readonly #options: StructuredArtifactProducerOptions;

  constructor(options: StructuredArtifactProducerOptions) {
    this.#options = options;
  }

  async run(input: {
    taskId?: string;
    revision?: number;
    attempt?: string;
    prompt: string;
    outputSchemaPath: string;
    outputPath: string;
    onProcessStarted?: (identity: ProcessStartIdentity) => void;
  }): Promise<{ process: Pick<ProcessResult, "exitCode" | "timedOut"> }> {
    const finalPath = assertPathInsideProject(
      this.#options.projectRoot,
      input.outputPath,
      "artifact output path",
    );
    const directory = path.dirname(finalPath);
    mkdirSync(directory, { recursive: true });
    const structuredPath = path.join(
      directory,
      "." + path.basename(finalPath) + "." + randomUUID() + ".structured.json",
    );
    try {
      const result = await this.#options.adapter.run({
        prompt: input.prompt,
        outputSchemaPath: input.outputSchemaPath,
        outputPath: structuredPath,
        ...(input.onProcessStarted !== undefined
          ? { onProcessStarted: input.onProcessStarted }
          : {}),
      });
      const markdown = renderStructuredArtifact(result.output);
      const maxBytes = this.#options.maxArtifactBytes ?? 2 * 1024 * 1024;
      publishArtifact(
        directory,
        path.basename(finalPath),
        markdown,
        (contents) => {
          parseMarkdownArtifact(contents, { maxBytes });
        },
        { maxBytes },
      );
      return { process: result.process };
    } finally {
      rmSync(structuredPath, { force: true });
    }
  }
}
