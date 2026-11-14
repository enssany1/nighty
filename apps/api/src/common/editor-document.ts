import { BadRequestException } from "@nestjs/common";

const ALLOWED_NODES = new Set(["doc", "paragraph", "text", "hardBreak", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "mention"]);
const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "code", "link", "underline"]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEditorDocument(value: unknown): JsonObject {
  if (!isObject(value) || value.type !== "doc") throw new BadRequestException("Editor document root must be doc");
  let nodes = 0;
  let textLength = 0;
  const visit = (node: unknown, depth: number): void => {
    if (!isObject(node) || typeof node.type !== "string" || !ALLOWED_NODES.has(node.type)) {
      throw new BadRequestException("Editor document contains an unsupported node");
    }
    nodes += 1;
    if (nodes > 1_000 || depth > 20) throw new BadRequestException("Editor document is too complex");
    if (node.type === "text") {
      if (typeof node.text !== "string") throw new BadRequestException("Text nodes require text");
      textLength += node.text.length;
      if (textLength > 100_000) throw new BadRequestException("Editor document is too large");
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.some((mark) => !isObject(mark) || typeof mark.type !== "string" || !ALLOWED_MARKS.has(mark.type))) {
        throw new BadRequestException("Editor document contains an unsupported mark");
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new BadRequestException("Editor node content must be an array");
      for (const child of node.content) visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return value;
}

export function extractPlainText(value: unknown): string {
  const document = validateEditorDocument(value);
  const read = (node: JsonObject): string => {
    if (node.type === "text") return node.text as string;
    if (node.type === "hardBreak") return "\n";
    if (node.type === "mention") return typeof (node.attrs as JsonObject | undefined)?.label === "string" ? `@${(node.attrs as JsonObject).label}` : "@mention";
    const content = Array.isArray(node.content) ? node.content.map((child) => read(child as JsonObject)).join("") : "";
    return ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(node.type as string) ? `${content}\n` : content;
  };
  return read(document).replace(/\n{3,}/g, "\n\n").trim();
}
