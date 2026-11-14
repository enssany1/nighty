import path from "node:path";

import { readBoundedUtf8File } from "./bounded-io.ts";

export type MarkdownScalar = string | number | boolean;
export type MarkdownFrontMatterValue = MarkdownScalar | MarkdownScalar[];

export type ParsedMarkdownArtifact = {
  frontMatter: Record<string, MarkdownFrontMatterValue>;
  sections: string[];
  body: string;
};

export type ParseMarkdownOptions = {
  maxBytes: number;
  /** Treat the input as a path to a bounded control artifact. */
  fromFile?: boolean;
  rejectControlArtifacts?: boolean;
};

const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function parseFrontMatterValue(raw: string, key: string): MarkdownFrontMatterValue {
  const value = raw.trim();
  if (value.length === 0) {
    throw new Error("malformed front matter: empty value for " + key);
  }
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) {
      throw new Error("malformed front matter: unterminated array for " + key);
    }
    const inner = value.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return inner
      .split(",")
      .map((item) => parseFrontMatterValue(item, key) as MarkdownScalar)
      .filter((item) => !Array.isArray(item));
  }
  if (value.startsWith('"')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("malformed front matter: invalid quoted value for " + key);
    }
    if (typeof parsed !== "string") {
      throw new Error("malformed front matter: invalid quoted value for " + key);
    }
    return parsed;
  }
  if (/^-?(?:0|[1-9][0-9]*)$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseFrontMatter(lines: string[]): {
  frontMatter: Record<string, MarkdownFrontMatterValue>;
  bodyStart: number;
} {
  const frontMatter: Record<string, MarkdownFrontMatterValue> = {};
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "---") {
      return { frontMatter, bodyStart: index + 1 };
    }
    if (line.trim().length === 0) continue;
    if (/^\s/.test(line)) {
      throw new Error("malformed front matter: nested values are not supported");
    }
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error("malformed front matter: unrecognized line: " + line);
    }
    const key = match[1] as string;
    if (Object.hasOwn(frontMatter, key)) {
      throw new Error("malformed front matter: duplicate key: " + key);
    }
    frontMatter[key] = parseFrontMatterValue(match[2] ?? "", key);
  }
  throw new Error("malformed front matter: missing closing delimiter");
}

function extractSections(lines: string[]): string[] {
  const sections: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      if (fence === null) fence = marker[0] as string;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (!heading) continue;
    const title = (heading[1] as string).replace(/\s+#+\s*$/, "").trim();
    if (title.length === 0) continue;
    if (sections.includes(title)) {
      throw new Error("malformed Markdown: duplicate section: " + title);
    }
    sections.push(title);
  }
  return sections;
}

export function parseMarkdownArtifact(
  input: string,
  options: ParseMarkdownOptions,
): ParsedMarkdownArtifact {
  if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer");
  }
  let text: string;
  if (options.fromFile === true) {
    text = readBoundedUtf8File(path.resolve(input), {
      maxBytes: options.maxBytes,
      rejectControlArtifacts: options.rejectControlArtifacts !== false,
    });
  } else {
    if (Buffer.byteLength(input, "utf8") > options.maxBytes) {
      throw new Error("Markdown exceeds the " + options.maxBytes + "-byte limit");
    }
    text = input;
  }

  if (FORBIDDEN_CONTROL.test(text)) {
    throw new Error("Markdown contains a forbidden control character");
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new Error("Markdown is missing required front matter");
  }
  const { frontMatter, bodyStart } = parseFrontMatter(lines);
  const bodyLines = lines.slice(bodyStart);
  return {
    frontMatter,
    sections: extractSections(bodyLines),
    body: bodyLines.join("\n"),
  };
}
