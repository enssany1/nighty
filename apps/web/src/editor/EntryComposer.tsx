import { ArrowRight, CalendarBlank, CheckSquare, Clock, Code, Image, ListBullets, ListNumbers, Minus, Paperclip, Quotes, TextHOne, TextHThree, TextHTwo, TextT, X } from "@phosphor-icons/react";
import StarterKit from "@tiptap/starter-kit";
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, jsonBody } from "../api/client";
import type { Entry, EntryType, TodoItem } from "../operations/types";
import { SelectionToolbar } from "./SelectionToolbar";
import { BACKGROUND_COLORS, TEXT_COLORS } from "./palette";

const actions: Array<{ type: EntryType; label: string; icon: typeof TextT; help: string; words: string[] }> = [
  { type: "UPDATE", label: "Update", icon: TextT, help: "Record progress or context", words: ["update", "note"] },
  { type: "TODO", label: "To-do list", icon: CheckSquare, help: "Add checkbox actions", words: ["todo", "to-do", "todolist", "to-do-list", "todo-list", "checklist", "list", "task", "tasks"] },
  { type: "FOLLOW", label: "Follow", icon: ArrowRight, help: "Transfer automatically at Handover", words: ["follow", "followup", "follow-up", "follow up"] },
];
const pad = (value: number) => String(value).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Formatting and insert commands; they change the text, not the kind of entry. */
const formats: Array<{ id: string; label: string; icon: typeof TextT; help: string; words: string[]; run(editor: Editor): void }> = [
  { id: "h1", label: "Heading 1", icon: TextHOne, help: "Large section heading", words: ["h1", "heading1", "heading", "title"], run: (editor) => { editor.chain().focus().setHeading({ level: 1 }).run(); } },
  { id: "h2", label: "Heading 2", icon: TextHTwo, help: "Medium section heading", words: ["h2", "heading2", "heading"], run: (editor) => { editor.chain().focus().setHeading({ level: 2 }).run(); } },
  { id: "h3", label: "Heading 3", icon: TextHThree, help: "Small section heading", words: ["h3", "heading3", "heading"], run: (editor) => { editor.chain().focus().setHeading({ level: 3 }).run(); } },
  { id: "bullet", label: "Bulleted list", icon: ListBullets, help: "A simple list of points", words: ["bullet", "bulleted", "bullets", "list", "ul"], run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
  { id: "num", label: "Numbered list", icon: ListNumbers, help: "Steps in order", words: ["num", "numbered", "number", "ol", "steps"], run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
  { id: "quote", label: "Quote", icon: Quotes, help: "Quote a message or note", words: ["quote", "blockquote"], run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
  { id: "code", label: "Code", icon: Code, help: "Logs, errors or commands as written", words: ["code", "codeblock", "log"], run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
  { id: "divider", label: "Divider", icon: Minus, help: "A line between parts", words: ["divider", "div", "line", "hr", "separator"], run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
  { id: "now", label: "Current time", icon: Clock, help: "Insert the time, e.g. 14:05", words: ["now", "time"], run: (editor) => { const now = new Date(); editor.chain().focus().insertContent(`${pad(now.getHours())}:${pad(now.getMinutes())} `).run(); } },
  { id: "today", label: "Today's date", icon: CalendarBlank, help: "Insert the date, e.g. 17 Nov 2026", words: ["today", "date"], run: (editor) => { const now = new Date(); editor.chain().focus().insertContent(`${pad(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()} `).run(); } },
];
type Command = { kind: "entry"; type: EntryType; label: string; icon: typeof TextT; help: string; words: string[] } | { kind: "format"; id: string; label: string; icon: typeof TextT; help: string; words: string[]; run(editor: Editor): void };
const matches = (query: string) => (item: { label: string; words: string[] }) => { const typed = query.toLowerCase(); return item.words.some((word) => word.startsWith(typed)) || item.label.toLowerCase().startsWith(typed); };
/** Every "/" command whose name starts with what was typed. Entry types come first. */
export function matchingCommands(query: string): Command[] {
  return [...actions.filter(matches(query)).map((action) => ({ ...action, kind: "entry" as const })), ...formats.filter(matches(query)).map((format) => ({ ...format, kind: "format" as const }))];
}
type SlashCommand = { from: number; to: number; query: string; lineStart: boolean };
/** Actions whose name starts with what was typed after "/" (for example "/fol" or "/to-do"). */
export function matchingActions(query: string) {
  const typed = query.toLowerCase().replace(/\s+/g, " ");
  return actions.filter((action) => action.words.some((word) => word.startsWith(typed)) || action.label.toLowerCase().startsWith(typed));
}
/** The "/command" being typed just before the cursor, if any. */
function slashCommandAt(state: { selection: { from: number; empty: boolean; $from: { parentOffset: number; parent: { textBetween(from: number, to: number): string } } } }): SlashCommand | null {
  const { selection } = state; if (!selection.empty) return null;
  const before = selection.$from.parent.textBetween(0, selection.$from.parentOffset);
  const match = /(?:^|\s)\/([a-z0-9-]{0,16})$/i.exec(before);
  if (!match || !matchingCommands(match[1]!).length) return null;
  const lineStart = before.slice(0, before.length - match[1]!.length - 1).trim() === "";
  return { from: selection.from - match[1]!.length - 1, to: selection.from, query: match[1]!, lineStart };
}
const keyFor = (date: string, shiftId: string) => `nighty:draft:${date}:${shiftId}`;
/** Typing is saved at most this long after the first unsaved keystroke, even while the author keeps typing. */
export const AUTOSAVE_DELAY_MS = 600;
type TodoDraft = { id: string; text: string };
type StoredDraft = { html?: string; type?: EntryType; todos?: string[]; entryId?: string | null };
type SaveState = "idle" | "saving" | "saved" | "empty" | "closed" | "error";
type EditorNode = { type?: string; content?: EditorNode[] };
let todoDraftSequence = 0;
const newTodoDraft = (text = ""): TodoDraft => ({ id: `todo-draft-${++todoDraftSequence}`, text });

async function upload(parentId: string, file: File, disposition: "INLINE" | "ATTACHMENT") {
  const body = new FormData(); body.append("file", file); body.append("parentType", "entry"); body.append("parentId", parentId); body.append("disposition", disposition);
  return api("/attachments", { method: "POST", body });
}

type EditorMark = { type: string; attrs?: Record<string, unknown> };
const allowedText = new Set<string>(TEXT_COLORS.map((color) => color.value)); const allowedBackground = new Set<string>(BACKGROUND_COLORS.map((color) => color.value));
/** Keeps only palette colours and safe links, for example from text pasted from another page. */
function cleanNode(node: EditorNode & { marks?: EditorMark[] }): EditorNode {
  const marks = node.marks?.flatMap((mark): EditorMark[] => {
    if (mark.type === "textStyle") {
      const color = typeof mark.attrs?.color === "string" && allowedText.has(mark.attrs.color.toLowerCase()) ? mark.attrs.color.toLowerCase() : null;
      const backgroundColor = typeof mark.attrs?.backgroundColor === "string" && allowedBackground.has(mark.attrs.backgroundColor.toLowerCase()) ? mark.attrs.backgroundColor.toLowerCase() : null;
      return color || backgroundColor ? [{ type: "textStyle", attrs: { color, backgroundColor } }] : [];
    }
    if (mark.type === "link") return typeof mark.attrs?.href === "string" && /^(https?:|mailto:)/i.test(mark.attrs.href) ? [mark] : [];
    return [mark];
  });
  return { ...node, ...(marks ? { marks } : {}), ...(node.content ? { content: node.content.map(cleanNode) } : {}) } as EditorNode;
}
/** Blank lines left at the end while typing are not part of the saved entry. */
function withoutTrailingBlankLines(input: EditorNode | undefined): EditorNode {
  const document = input ? cleanNode(input) : undefined;
  const content = [...(document?.content ?? [])];
  while (content.length > 1 && content[content.length - 1]?.type === "paragraph" && !content[content.length - 1]?.content?.length) content.pop();
  return { ...(document ?? { type: "doc" }), content };
}

const statusText: Record<SaveState, string> = {
  idle: "Saves automatically as you type",
  saving: "Saving…",
  saved: "Saved · press Enter twice for a new entry",
  empty: "An entry can't be empty. The last saved text is kept.",
  closed: "This shift is closed. Your text is kept on this device.",
  error: "Could not save. Your text is kept on this device.",
};

export function EntryComposer({ shiftId, operationalDate, onSaved, onHandover }: { shiftId: string; operationalDate: string; onSaved(entryId: string | null): void; onHandover(): void; }) {
  const storageKey = keyFor(operationalDate, shiftId);
  const restored = useMemo(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as StoredDraft | null; } catch { return null; } }, [storageKey]);
  const [type, setType] = useState<EntryType>(restored?.type ?? "UPDATE");
  // The action label appears only once the author picks an action or starts writing.
  const [chosen, setChosen] = useState(Boolean(restored?.type && restored.type !== "UPDATE")); const [hasText, setHasText] = useState(Boolean(restored?.entryId));
  const [todos, setTodos] = useState<TodoDraft[]>(() => (restored?.todos?.length ? restored.todos : [""]).map(newTodoDraft));
  const [images, setImages] = useState<File[]>([]); const [files, setFiles] = useState<File[]>([]);
  const [slash, setSlash] = useState<SlashCommand | null>(null); const [highlight, setHighlight] = useState(0); const [mentionMenu, setMentionMenu] = useState(false);
  const slashRef = useRef<SlashCommand | null>(null); const highlightRef = useRef(0); const dismissedAt = useRef<number | null>(null);
  const menu = slash !== null; const options = slash ? matchingCommands(slash.query) : [];
  const setMenu = (open: false) => { if (!open) { slashRef.current = null; setSlash(null); } };
  const [team, setTeam] = useState<Array<{ id: string; displayName: string }>>([]);
  const [saveState, setSaveState] = useState<SaveState>(restored?.entryId ? "saved" : "idle");
  const fileInput = useRef<HTMLInputElement>(null); const imageInput = useRef<HTMLInputElement>(null); const emptyEnterRow = useRef<string | null>(null);
  const entryId = useRef<string | null>(restored?.entryId ?? null);
  // Each entry typed in this composer gets a generation, so a save that finishes after the
  // author has already moved on to the next entry can never land in the wrong one.
  const generation = useRef(0); const savedIds = useRef(new Map<number, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null); const dirty = useRef(false); const mounted = useRef(true);
  const latest = useRef({ type, todos, images, files }); latest.current = { type, todos, images, files };
  const callbacks = useRef({ onSaved, finish: () => Promise.resolve(false), changed: () => undefined as void, flush: () => Promise.resolve(), choose: (_next: EntryType) => undefined as void, run: (_command: Command) => undefined as void });
  const snapshot = useRef<{ html: string; text: string; json: EditorNode | undefined }>({ html: restored?.html ?? "", text: "", json: undefined });
  callbacks.current.onSaved = onSaved;

  useEffect(() => { document.querySelector(".slash-menu button.highlighted")?.scrollIntoView({ block: "nearest" }); }, [highlight, slash]);
  useEffect(() => { api<Array<{ id: string; displayName: string }>>("/team").then(setTeam).catch(() => undefined); }, []);

  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, BackgroundColor, Placeholder.configure({ placeholder: "Type / to choose Update, To-do list or Follow… or just start writing" })], content: restored?.html ?? "",
    editorProps: {
      attributes: { class: "tiptap-editor", "aria-label": "Write an update" },
      handlePaste: (_view, event) => { const pasted = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/")); if (!pasted.length) return false; setImages((current) => [...current, ...pasted]); callbacks.current.changed(); return true; },
      handleKeyDown: (view, event) => {
        const command = slashRef.current;
        if (command) {
          const found = matchingCommands(command.query);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { const next = (highlightRef.current + (event.key === "ArrowDown" ? 1 : found.length - 1)) % found.length; highlightRef.current = next; setHighlight(next); return true; }
          if (event.key === "Enter" || event.key === "Tab") { const picked = found[Math.min(highlightRef.current, found.length - 1)]; if (picked) { callbacks.current.run(picked); return true; } }
          if (event.key === " " && found.length === 1 && found[0]!.words.includes(command.query.toLowerCase())) { callbacks.current.run(found[0]!); return true; }
        }
        if (event.key === "Escape") { if (slashRef.current) dismissedAt.current = slashRef.current.from; slashRef.current = null; setSlash(null); setMentionMenu(false); callbacks.current.changed(); return false; }
        if (event.key !== "Enter" || event.shiftKey) return false;
        if (event.ctrlKey || event.metaKey) { void callbacks.current.finish(); return true; }
        const { $from, empty } = view.state.selection; const document = view.state.doc;
        const onBlankLastLine = empty && $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.index(0) === document.childCount - 1;
        if (!onBlankLastLine || document.textContent.trim() === "") return false;
        void callbacks.current.finish();
        return true;
      },
    },
    onCreate: ({ editor: current }) => { snapshot.current = { html: current.getHTML(), text: current.getText(), json: current.getJSON() as EditorNode }; },
    onUpdate: ({ editor: current }) => { const text = current.getText(); setHasText(text.trim() !== "" && !/^\/[a-z0-9-]*$/i.test(text.trim())); snapshot.current = { html: current.getHTML(), text, json: current.getJSON() as EditorNode }; let command = slashCommandAt(current.state); if (!command) dismissedAt.current = null; else if (command.from === dismissedAt.current) command = null; if (command?.query !== slashRef.current?.query || !command) { highlightRef.current = 0; setHighlight(0); } slashRef.current = command; setSlash(command); setMentionMenu(text.trimEnd().endsWith("@")); callbacks.current.changed(); },
    onBlur: () => { void callbacks.current.flush(); },
  });
  const editorRef = useRef(editor); editorRef.current = editor;

  const remember = useCallback(() => {
    const current = latest.current;
    localStorage.setItem(storageKey, JSON.stringify({ html: snapshot.current.html, type: current.type, todos: current.todos.map((item) => item.text), entryId: entryId.current } satisfies StoredDraft));
  }, [storageKey]);

  type Snapshot = { html: string; text: string; json: EditorNode | undefined };
  type Content = { type: EntryType; todos: TodoDraft[]; images: File[]; files: File[] };
  /** Writes one entry to the server. Returns the saved id, null when there was nothing to save, or the error. */
  const persist = useCallback(async (content: Content, draft: Snapshot, id: string | null): Promise<{ id: string | null; error?: unknown; uploadFailed?: boolean }> => {
    const todoItems: TodoItem[] = content.todos.map((item) => item.text.trim()).filter(Boolean).map((text, index) => ({ text, completed: false, position: index + 1 }));
    const text = draft.text.trim();
    const plainText = content.type === "TODO" ? todoItems.map((item) => item.text).join("\n") : text;
    if (!plainText) return { id: null };
    const body = jsonBody({ type: content.type, editorDocument: withoutTrailingBlankLines(draft.json), plainText, ...(content.type === "TODO" ? { todoItems } : {}), ...(id ? { autosave: true } : {}) });
    let saved: Entry;
    try {
      saved = id ? await api<Entry>(`/entries/${id}`, { method: "PATCH", ...body }) : await api<Entry>(`/shift-instances/${shiftId}/entries`, { method: "POST", ...body });
    } catch (error) { return { id, error }; }
    if (content.images.length || content.files.length) {
      try { await Promise.all([...content.images.map((file) => upload(saved.id, file, "INLINE")), ...content.files.map((file) => upload(saved.id, file, "ATTACHMENT"))]); }
      catch { return { id: saved.id, uploadFailed: true }; }
    }
    return { id: saved.id };
  }, [shiftId]);

  const saveOnce = useCallback(async () => {
    const gen = generation.current; const content = { ...latest.current }; const draft = { ...snapshot.current };
    const current = gen === generation.current;
    const hasText = content.type === "TODO" ? content.todos.some((item) => item.text.trim()) : draft.text.trim() !== "";
    if (!hasText) { if (mounted.current) setSaveState(entryId.current ? "empty" : "idle"); return; }
    if (mounted.current) setSaveState("saving");
    const result = await persist(content, draft, entryId.current);
    const stillCurrent = gen === generation.current;
    if (result.id) savedIds.current.set(gen, result.id);
    if (result.error) {
      if (result.error instanceof ApiError && result.error.status === 404 && result.id && stillCurrent) { entryId.current = null; dirty.current = true; return; }
      if (mounted.current && stillCurrent) setSaveState(result.error instanceof ApiError && result.error.status === 403 ? "closed" : "error");
      return;
    }
    if (!result.id || !stillCurrent || !current) { callbacks.current.onSaved(entryId.current); return; }
    entryId.current = result.id; remember();
    if (content.images.length || content.files.length) {
      if (mounted.current) { setImages((pending) => pending.filter((file) => !content.images.includes(file))); setFiles((pending) => pending.filter((file) => !content.files.includes(file))); }
      latest.current = { ...latest.current, images: latest.current.images.filter((file) => !content.images.includes(file)), files: latest.current.files.filter((file) => !content.files.includes(file)) };
    }
    if (mounted.current) setSaveState(result.uploadFailed ? "error" : "saved");
    callbacks.current.onSaved(result.id);
  }, [persist, remember]);

  /** Saves everything typed so far; saves never overlap and the latest text always wins. */
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (slashRef.current) return;
    if (saving.current) { await saving.current; if (!dirty.current) return; }
    if (!dirty.current) return;
    const run = (async () => { while (dirty.current) { dirty.current = false; await saveOnce(); } })().finally(() => { saving.current = null; });
    saving.current = run;
    await run;
  }, [saveOnce]);

  const changed = useCallback(() => {
    dirty.current = true; remember();
    // A "/command" that is still being typed is not part of the entry yet.
    if (slashRef.current) { if (timer.current) { clearTimeout(timer.current); timer.current = null; } return; }
    // Not reset on every keystroke: the board keeps up while someone types without pausing.
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, AUTOSAVE_DELAY_MS);
  }, [flush, remember]);

  /**
   * Completes the entry being typed and leaves an empty composer for the next one straight away.
   * The finished entry is saved in the background, so nothing typed next can end up in it.
   */
  const finish = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const content = { ...latest.current, todos: [...latest.current.todos] }; const draft = { ...snapshot.current };
    const hasText = content.type === "TODO" ? content.todos.some((item) => item.text.trim()) : draft.text.trim() !== "";
    if (!hasText && !entryId.current) return false;
    const gen = generation.current; const knownId = entryId.current; const pending = saving.current;
    const needsSave = hasText && (dirty.current || !knownId || pending !== null);

    generation.current += 1; entryId.current = null; dirty.current = false; emptyEnterRow.current = null;
    editorRef.current?.commands.clearContent(); snapshot.current = { html: "", text: "", json: undefined };
    latest.current = { type: "UPDATE", todos: [], images: [], files: [] };
    setTodos([newTodoDraft()]); setType("UPDATE"); setChosen(false); setHasText(false); setImages([]); setFiles([]); setMenu(false); setMentionMenu(false);
    localStorage.removeItem(storageKey);
    if (mounted.current) setSaveState("idle");
    callbacks.current.onSaved(null);
    setTimeout(() => { if (mounted.current && latest.current.type !== "TODO") editorRef.current?.commands.focus(); });

    const job: Promise<void> = (async () => {
      if (pending) await pending;
      if (!needsSave) return;
      const result = await persist(content, draft, knownId ?? savedIds.current.get(gen) ?? null);
      if (result.error || result.uploadFailed) {
        // Never lose a finished entry. If nothing new was typed yet, put it back in the composer;
        // otherwise keep it on this device so it is offered again when the composer next opens.
        const composerEmpty = !snapshot.current.text.trim() && !latest.current.todos.some((item) => item.text.trim()) && !entryId.current;
        if (mounted.current && composerEmpty) {
          generation.current += 1; entryId.current = result.id;
          editorRef.current?.commands.setContent(draft.html); snapshot.current = { ...draft };
          latest.current = { ...latest.current, type: content.type, todos: content.todos };
          setType(content.type); setChosen(true); setHasText(true); setTodos(content.todos.length ? content.todos : [newTodoDraft()]); remember();
        } else {
          localStorage.setItem(storageKey, JSON.stringify({ html: draft.html, type: content.type, todos: content.todos.map((item) => item.text), entryId: result.id } satisfies StoredDraft));
        }
        if (mounted.current) setSaveState(result.error instanceof ApiError && result.error.status === 403 ? "closed" : "error");
      }
      callbacks.current.onSaved(entryId.current);
    })().finally(() => { if (saving.current === job) saving.current = null; });
    saving.current = job;
    return true;
  }, [persist, remember, storageKey]);
  callbacks.current.finish = finish; callbacks.current.changed = changed; callbacks.current.flush = flush;

  // A draft that never reached the server (for example after a failed save) is saved when the composer opens.
  useEffect(() => { if (!editor || entryId.current) return; snapshot.current = { html: editor.getHTML(), text: editor.getText(), json: editor.getJSON() as EditorNode }; if (editor.getText().trim() || latest.current.todos.some((item) => item.text.trim())) changed(); }, [changed, editor]);
  // Nothing typed is lost when the composer goes away or the tab is hidden.
  useEffect(() => { const hidden = () => { if (document.visibilityState === "hidden") void flush(); }; document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden); }, [flush]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void flush(); }; }, [flush]);

  function updateTodos(next: (current: TodoDraft[]) => TodoDraft[]) { setTodos((current) => { const value = next(current); latest.current = { ...latest.current, todos: value }; return value; }); changed(); }
  /** Applies an action picked from the "/" menu. */
  function choose(next: EntryType) {
    const command = slashRef.current; slashRef.current = null; setSlash(null);
    if (editor && command) editor.chain().deleteRange({ from: command.from, to: command.to }).run();
    const rest = editor?.getText().trim() ?? "";
    if (editor) snapshot.current = { html: editor.getHTML(), text: editor.getText(), json: editor.getJSON() as EditorNode };
    const typeChanges = next !== latest.current.type;
    // A command on its own line starts a new entry and the text above stays as it was.
    // A command inside a line changes the entry being typed (a To-do list always starts fresh).
    const startsNew = !command || command.lineStart || next === "TODO";
    if (typeChanges && startsNew && (entryId.current || rest) && (latest.current.type === "TODO" ? latest.current.todos.some((item) => item.text.trim()) : rest)) {
      void finish();
    } else if (typeChanges && entryId.current && !rest) {
      // Nothing but the command was left in the entry being typed: start fresh instead of emptying it.
      generation.current += 1; entryId.current = null; dirty.current = false; localStorage.removeItem(storageKey); callbacks.current.onSaved(null); setSaveState("idle");
    }
    setType(next); setChosen(true); latest.current = { ...latest.current, type: next };
    if (next === "TODO") setTimeout(() => (document.querySelector("[data-todo-id]") as HTMLInputElement | null)?.focus());
    else setTimeout(() => editorRef.current?.commands.focus("end"));
    if (next !== "TODO" && (editorRef.current?.getText().trim() ?? "")) changed(); else remember();
  }
  callbacks.current.choose = choose;
  function runCommand(command: Command) {
    if (command.kind === "entry") { choose(command.type); return; }
    const typed = slashRef.current; slashRef.current = null; setSlash(null);
    if (!editor) return;
    if (typed) editor.chain().deleteRange({ from: typed.from, to: typed.to }).run();
    command.run(editor);
    changed();
  }
  callbacks.current.run = runCommand;
  function mention(displayName: string) {
    if (!editor) return;
    const { from } = editor.state.selection; const before = editor.state.doc.textBetween(Math.max(0, from - 1), from);
    editor.chain().focus().deleteRange({ from: before === "@" ? from - 1 : from, to: from }).insertContent(`@${displayName} `).run(); setMentionMenu(false);
  }
  function removeTodo(id: string) { updateTodos((current) => current.length === 1 ? [newTodoDraft()] : current.filter((item) => item.id !== id)); emptyEnterRow.current = null; }
  function todoKey(id: string, key: string) {
    const index = todos.findIndex((item) => item.id === id);
    if (index < 0) return;
    if (key === "Backspace" && !todos[index]?.text) { removeTodo(id); return; }
    if (key !== "Enter") return;
    if (!todos[index]?.text.trim()) {
      if (emptyEnterRow.current !== id) { emptyEnterRow.current = id; return; }
      emptyEnterRow.current = null;
      if (todos.some((item) => item.text.trim())) void finish();
      return;
    }
    const added = newTodoDraft();
    emptyEnterRow.current = null;
    updateTodos((current) => [...current.slice(0, index + 1), added, ...current.slice(index + 1)]);
    setTimeout(() => (document.querySelector(`[data-todo-id="${added.id}"]`) as HTMLInputElement | null)?.focus());
  }
  async function closeTodoBlock() {
    if (await finish()) return;
    setTodos([newTodoDraft()]); setType("UPDATE"); setChosen(false); latest.current = { ...latest.current, type: "UPDATE", todos: [] }; remember(); setTimeout(() => editor?.commands.focus());
  }
  async function handover() { dirty.current = true; await flush(); onHandover(); }
  function attach(kind: "image" | "file", added: File[]) { if (kind === "image") setImages((current) => { const value = [...current, ...added]; latest.current = { ...latest.current, images: value }; return value; }); else setFiles((current) => { const value = [...current, ...added]; latest.current = { ...latest.current, files: value }; return value; }); changed(); }

  const kind = actions.find((action) => action.type === type)!;
  return <section className="entry-composer" aria-label="Shift update composer"><div className="composer-body"><div className="composer-gutter" aria-hidden="true"><time>{saveState === "saved" || saveState === "saving" ? "now" : ""}</time>{(chosen || hasText || type !== "UPDATE") && <span className={`entry-label entry-label-${type.toLowerCase()}`}><kind.icon /> {kind.label}</span>}</div>{type === "TODO" ? <div className="todo-editor"><header><strong>To-do list</strong><button type="button" className="icon-button small" onClick={() => void closeTodoBlock()} aria-label="Close to-do list"><X /></button></header>{todos.map((item, index) => <div className="todo-editor-row" key={item.id}><input type="checkbox" disabled aria-label={`To-do item ${index + 1}`} /><input aria-label={`To-do text ${index + 1}`} data-todo-id={item.id} value={item.text} onChange={(event) => { emptyEnterRow.current = null; const text = event.target.value; updateTodos((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, text } : currentItem)); }} onKeyDown={(event) => { if (event.key === "Enter" || (event.key === "Backspace" && !event.currentTarget.value)) { event.preventDefault(); todoKey(item.id, event.key); } }} onBlur={() => void flush()} placeholder={index === 0 ? "Add a to-do and press Enter" : "Another to-do"} /><button type="button" className="icon-button small remove-todo" onClick={() => removeTodo(item.id)} aria-label={`Remove to-do ${index + 1}`}><X /></button></div>)}</div> : <><EditorContent editor={editor} />{editor && <SelectionToolbar editor={editor} />}</>}{menu && options.length > 0 && <div className="slash-menu" role="menu" aria-label="Insert action">{options.map((action, index) => <button key={action.kind === "entry" ? action.type : action.id} role="menuitem" className={`${index === Math.min(highlight, options.length - 1) ? "highlighted" : ""}${index > 0 && action.kind === "format" && options[index - 1]?.kind === "entry" ? " group-start" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(action)}><action.icon /><span><strong>{action.label}</strong><small>{action.help}</small></span></button>)}<small className="slash-hint">Enter to choose · Esc to keep typing</small></div>}{mentionMenu && team.length > 0 && <div className="slash-menu mention-menu" role="menu" aria-label="Mention teammate">{team.map((member) => <button key={member.id} role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => mention(member.displayName)}><span><strong>@{member.displayName}</strong></span></button>)}</div>}{images.length > 0 && <div className="image-previews">{images.map((file, index) => <figure key={`${file.name}-${index}`}><img src={URL.createObjectURL(file)} alt={file.name} /><figcaption>{file.name}</figcaption></figure>)}</div>}{files.length > 0 && <ul className="pending-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Paperclip /> {file.name}</li>)}</ul>}</div><footer><div className="composer-tools"><button className="icon-button" onClick={() => fileInput.current?.click()} aria-label="Attach file"><Paperclip /></button><button className="icon-button" onClick={() => imageInput.current?.click()} aria-label="Add image"><Image /></button><input ref={fileInput} hidden type="file" onChange={(event) => attach("file", Array.from(event.target.files ?? []))} /><input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => attach("image", Array.from(event.target.files ?? []))} /></div><div className="composer-actions"><span role="status" className={`save-state ${saveState}`}>{(images.length > 0 || files.length > 0) && saveState === "idle" ? "Add text to save the attachment" : statusText[saveState]}</span><button className="primary-button handover-button" onClick={() => void handover()}><ArrowRight /> Handover</button></div></footer></section>;
}
