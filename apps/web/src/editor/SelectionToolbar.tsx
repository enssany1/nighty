import { CaretDown, TextB, TextItalic, TextStrikethrough, TextUnderline } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { useState } from "react";
import { BACKGROUND_COLORS, TEXT_COLORS } from "./palette";

/** Notion-style toolbar shown when text is selected: bold, italic, underline, strike and colours. */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const [colors, setColors] = useState(false);
  const keep = (event: React.MouseEvent) => event.preventDefault();
  const mark = (name: string, label: string, Icon: typeof TextB, toggle: () => void) =>
    <button type="button" aria-label={label} aria-pressed={editor.isActive(name)} className={editor.isActive(name) ? "active" : ""} onMouseDown={keep} onClick={toggle}><Icon weight="bold" /></button>;
  const current = editor.getAttributes("textStyle") as { color?: string | null; backgroundColor?: string | null };
  return <BubbleMenu editor={editor} className="selection-toolbar" shouldShow={({ editor: active, state }) => !state.selection.empty && !active.isActive("codeBlock")} options={{ placement: "top-start", onHide: () => setColors(false) }}>
    {mark("bold", "Bold", TextB, () => editor.chain().focus().toggleBold().run())}
    {mark("italic", "Italic", TextItalic, () => editor.chain().focus().toggleItalic().run())}
    {mark("underline", "Underline", TextUnderline, () => editor.chain().focus().toggleUnderline().run())}
    {mark("strike", "Strikethrough", TextStrikethrough, () => editor.chain().focus().toggleStrike().run())}
    <span className="toolbar-divider" />
    <button type="button" className="color-trigger" aria-label="Text colour" aria-expanded={colors} onMouseDown={keep} onClick={() => setColors((open) => !open)}>
      <span className="color-letter" style={{ color: current.color ?? undefined, backgroundColor: current.backgroundColor ?? undefined }}>A</span><CaretDown />
    </button>
    {colors && <div className="color-panel" role="menu" aria-label="Colours">
      <small>Text colour</small>
      <div className="color-row">
        <button type="button" role="menuitem" aria-label="Default text colour" title="Default" onMouseDown={keep} onClick={() => editor.chain().focus().unsetColor().run()}><span className="color-letter">A</span></button>
        {TEXT_COLORS.map((color) => <button key={color.value} type="button" role="menuitem" aria-label={`${color.name} text`} title={color.name} className={current.color === color.value ? "active" : ""} onMouseDown={keep} onClick={() => editor.chain().focus().setColor(color.value).run()}><span className="color-letter" style={{ color: color.value }}>A</span></button>)}
      </div>
      <small>Background</small>
      <div className="color-row">
        <button type="button" role="menuitem" aria-label="No background" title="Default" onMouseDown={keep} onClick={() => editor.chain().focus().unsetBackgroundColor().run()}><span className="color-letter swatch" /></button>
        {BACKGROUND_COLORS.map((color) => <button key={color.value} type="button" role="menuitem" aria-label={`${color.name} background`} title={color.name} className={current.backgroundColor === color.value ? "active" : ""} onMouseDown={keep} onClick={() => editor.chain().focus().setBackgroundColor(color.value).run()}><span className="color-letter swatch" style={{ backgroundColor: color.value }} /></button>)}
      </div>
    </div>}
  </BubbleMenu>;
}
