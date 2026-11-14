import { BadRequestException } from "@nestjs/common";
import { extractPlainText, validateEditorDocument } from "../common/editor-document";
import { normalizeTodoItems } from "./entries.service";

describe("entry boundaries", () => {
  it("derives stable plain text from a supported Tiptap document", () => {
    const document = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }, { type: "hardBreak" }, { type: "text", text: "Nighty" }] }] };
    expect(validateEditorDocument(document)).toEqual(document);
    expect(extractPlainText(document)).toBe("Hello\nNighty");
  });

  it("rejects unsupported editor nodes", () => {
    expect(() => validateEditorDocument({ type: "doc", content: [{ type: "script", text: "bad" }] }))
      .toThrow(BadRequestException);
  });

  it("removes blank To-do rows and requires one nonblank item", () => {
    expect(normalizeTodoItems([
      { text: " first ", position: 9 }, { text: "  ", position: 10 }, { text: "second", completed: true, position: 11 },
    ])).toEqual([
      { text: "first", completed: false, position: 1 },
      { text: "second", completed: true, position: 2 },
    ]);
    expect(() => normalizeTodoItems([{ text: " ", position: 1 }])).toThrow(BadRequestException);
  });
});
