import type { CSSProperties, ReactNode } from "react";
import { BACKGROUND_COLORS, TEXT_COLORS } from "./palette";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: Mark[]; content?: Node[] };

const textColors = new Set<string>(TEXT_COLORS.map((color) => color.value));
const backgroundColors = new Set<string>(BACKGROUND_COLORS.map((color) => color.value));
const safeHref = (value: unknown) => typeof value === "string" && /^(https?:|mailto:)/i.test(value) ? value : null;

function withMarks(text: ReactNode, marks: Mark[] | undefined, key: string): ReactNode {
  let result = text;
  for (const [index, mark] of (marks ?? []).entries()) {
    const markKey = `${key}-${index}`;
    if (mark.type === "bold") result = <strong key={markKey}>{result}</strong>;
    else if (mark.type === "italic") result = <em key={markKey}>{result}</em>;
    else if (mark.type === "underline") result = <u key={markKey}>{result}</u>;
    else if (mark.type === "strike") result = <s key={markKey}>{result}</s>;
    else if (mark.type === "code") result = <code key={markKey}>{result}</code>;
    else if (mark.type === "link") { const href = safeHref(mark.attrs?.href); if (href) result = <a key={markKey} href={href} target="_blank" rel="noopener noreferrer">{result}</a>; }
    else if (mark.type === "textStyle") {
      const style: CSSProperties = {};
      const color = mark.attrs?.color; const background = mark.attrs?.backgroundColor;
      if (typeof color === "string" && textColors.has(color)) style.color = color;
      if (typeof background === "string" && backgroundColors.has(background)) { style.backgroundColor = background; style.borderRadius = 3; style.padding = "0 2px"; }
      if (style.color || style.backgroundColor) result = <span key={markKey} style={style}>{result}</span>;
    }
  }
  return result;
}

function render(node: Node, key: string): ReactNode {
  const children = (node.content ?? []).map((child, index) => render(child, `${key}.${index}`));
  switch (node.type) {
    case "doc": return <>{children}</>;
    case "text": return withMarks(node.text ?? "", node.marks, key);
    case "paragraph": return <p key={key}>{children.length ? children : <br />}</p>;
    case "heading": { const level = Number(node.attrs?.level); return level === 1 ? <h3 key={key} className="rich-h1">{children}</h3> : level === 2 ? <h4 key={key} className="rich-h2">{children}</h4> : <h5 key={key} className="rich-h3">{children}</h5>; }
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key} start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock": return <pre key={key}><code>{(node.content ?? []).map((child) => child.text ?? "").join("")}</code></pre>;
    case "horizontalRule": return <hr key={key} />;
    case "hardBreak": return <br key={key} />;
    case "mention": return <span key={key} className="mention">@{String(node.attrs?.label ?? "")}</span>;
    default: return children.length ? <span key={key}>{children}</span> : null;
  }
}

/** Shows a saved entry with its formatting. Falls back to plain text for entries without a document. */
export function RichText({ document, fallback }: { document: unknown; fallback: string }) {
  const doc = document as Node | null;
  const hasContent = doc && doc.type === "doc" && Array.isArray(doc.content) && doc.content.length > 0;
  if (!hasContent) return <div className="rich-text"><p>{fallback}</p></div>;
  return <div className="rich-text">{render(doc, "n")}</div>;
}
