import { BadRequestException } from "@nestjs/common";

const ALLOWED_NODES = new Set(["doc", "paragraph", "text", "hardBreak", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule", "mention"]);
const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "code", "link", "underline", "textStyle"]);
/** The Notion-style palette offered in the editor; any other colour is rejected. */
export const TEXT_COLORS = new Set(["#787774", "#d9730d", "#cb912f", "#448361", "#337ea9", "#9065b0", "#d44c47"]);
export const BACKGROUND_COLORS = new Set(["#f1f1ef", "#fbecdd", "#fbf3db", "#edf3ec", "#e7f3f8", "#f4f0f7", "#fdebec"]);

function validateMark(mark: JsonObject) {
  const attrs = mark.attrs;
  if (attrs !== undefined && attrs !== null && !isObject(attrs)) throw new BadRequestException("Editor mark attributes must be an object");
  if (mark.type === "textStyle" && isObject(attrs)) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (name === "color" && typeof value === "string" && TEXT_COLORS.has(value.toLowerCase())) continue;
      if (name === "backgroundColor" && typeof value === "string" && BACKGROUND_COLORS.has(value.toLowerCase())) continue;
      throw new BadRequestException("Editor text style is not supported");
    }
  }
  if (mark.type === "link" && isObject(attrs) && attrs.href !== undefined && attrs.href !== null) {
    if (typeof attrs.href !== "string" || !/^(https?:|mailto:)/i.test(attrs.href)) throw new BadRequestException("Editor links must use http, https or mailto");
  }
}

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
      for (const mark of node.marks as JsonObject[]) validateMark(mark);
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
    if (node.type === "horizontalRule") return "\n";
    return ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(node.type as string) ? `${content}\n` : content;
  };
  return read(document).replace(/\n{3,}/g, "\n\n").trim();
}
