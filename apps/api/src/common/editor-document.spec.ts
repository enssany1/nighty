import { extractPlainText, validateEditorDocument } from "./editor-document";

const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("editor document rules", () => {
  it("accepts headings, lists, quotes, code, dividers and palette colours", () => {
    const value = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Status")] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Restored", [{ type: "textStyle", attrs: { color: "#448361", backgroundColor: null } }])] }] }] },
      { type: "horizontalRule" },
      { type: "blockquote", content: [{ type: "paragraph", content: [text("Vendor note", [{ type: "textStyle", attrs: { backgroundColor: "#fbf3db" } }])] }] },
      { type: "codeBlock", content: [text("ERR 504")] },
    );
    expect(() => validateEditorDocument(value)).not.toThrow();
    expect(extractPlainText(value)).toBe("Status\nRestored\n\nVendor note\n\nERR 504");
  });

  it("rejects colours outside the palette, other style attributes and unsafe links", () => {
    expect(() => validateEditorDocument(doc({ type: "paragraph", content: [text("x", [{ type: "textStyle", attrs: { color: "#123456" } }])] }))).toThrow("text style");
    expect(() => validateEditorDocument(doc({ type: "paragraph", content: [text("x", [{ type: "textStyle", attrs: { fontFamily: "serif" } }])] }))).toThrow("text style");
    expect(() => validateEditorDocument(doc({ type: "paragraph", content: [text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])] }))).toThrow("links");
    expect(() => validateEditorDocument(doc({ type: "paragraph", content: [text("x", [{ type: "link", attrs: { href: "https://status.example.com" } }])] }))).not.toThrow();
  });
});
