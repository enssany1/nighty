import { ArrowRight, CheckSquare, Image, Paperclip, TextT, X } from "@phosphor-icons/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, jsonBody } from "../api/client";
import type { Entry, EntryType, TodoItem } from "../operations/types";

const actions: Array<{ type: EntryType; label: string; icon: typeof TextT; help: string }> = [
  { type: "UPDATE", label: "Update", icon: TextT, help: "Record progress or context" },
  { type: "TODO", label: "To-do list", icon: CheckSquare, help: "Add checkbox actions" },
  { type: "FOLLOW", label: "Follow", icon: ArrowRight, help: "Transfer automatically at Handover" },
];
const keyFor = (date: string, shiftId: string) => `nighty:draft:${date}:${shiftId}`;
/** Pause in typing after which the entry is saved automatically. */
export const AUTOSAVE_DELAY_MS = 800;
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

/** Blank lines left at the end while typing are not part of the saved entry. */
function withoutTrailingBlankLines(document: EditorNode | undefined): EditorNode {
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
  const [todos, setTodos] = useState<TodoDraft[]>(() => (restored?.todos?.length ? restored.todos : [""]).map(newTodoDraft));
  const [images, setImages] = useState<File[]>([]); const [files, setFiles] = useState<File[]>([]);
  const [menu, setMenu] = useState(false); const [mentionMenu, setMentionMenu] = useState(false);
  const [team, setTeam] = useState<Array<{ id: string; displayName: string }>>([]);
  const [saveState, setSaveState] = useState<SaveState>(restored?.entryId ? "saved" : "idle");
  const fileInput = useRef<HTMLInputElement>(null); const imageInput = useRef<HTMLInputElement>(null); const emptyEnterRow = useRef<string | null>(null);
  const entryId = useRef<string | null>(restored?.entryId ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null); const dirty = useRef(false); const mounted = useRef(true);
  const latest = useRef({ type, todos, images, files }); latest.current = { type, todos, images, files };
  const callbacks = useRef({ onSaved, finish: () => Promise.resolve(false), changed: () => undefined as void, flush: () => Promise.resolve() });
  const snapshot = useRef<{ html: string; text: string; json: EditorNode | undefined }>({ html: restored?.html ?? "", text: "", json: undefined });
  callbacks.current.onSaved = onSaved;

  useEffect(() => { api<Array<{ id: string; displayName: string }>>("/team").then(setTeam).catch(() => undefined); }, []);

  const editor = useEditor({
    extensions: [StarterKit], content: restored?.html ?? "",
    editorProps: {
      attributes: { class: "tiptap-editor", "aria-label": "Write an update" },
      handlePaste: (_view, event) => { const pasted = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/")); if (!pasted.length) return false; setImages((current) => [...current, ...pasted]); callbacks.current.changed(); return true; },
      handleKeyDown: (view, event) => {
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
    onUpdate: ({ editor: current }) => { const text = current.getText(); snapshot.current = { html: current.getHTML(), text, json: current.getJSON() as EditorNode }; setMenu(text.trimEnd().endsWith("/")); setMentionMenu(text.trimEnd().endsWith("@")); callbacks.current.changed(); },
    onBlur: () => { void callbacks.current.flush(); },
  });
  const editorRef = useRef(editor); editorRef.current = editor;

  const remember = useCallback(() => {
    const current = latest.current;
    localStorage.setItem(storageKey, JSON.stringify({ html: snapshot.current.html, type: current.type, todos: current.todos.map((item) => item.text), entryId: entryId.current } satisfies StoredDraft));
  }, [storageKey]);

  const saveOnce = useCallback(async () => {
    const current = latest.current; const draft = snapshot.current;
    const todoItems: TodoItem[] = current.todos.map((item) => item.text.trim()).filter(Boolean).map((text, index) => ({ text, completed: false, position: index + 1 }));
    const text = draft.text.trim();
    const plainText = current.type === "TODO" ? todoItems.map((item) => item.text).join("\n") : text;
    if (!plainText || (text === "/" && current.type !== "TODO")) { if (mounted.current) setSaveState(entryId.current ? "empty" : "idle"); return; }
    if (mounted.current) setSaveState("saving");
    const body = jsonBody({ type: current.type, editorDocument: withoutTrailingBlankLines(draft.json), plainText, ...(current.type === "TODO" ? { todoItems } : {}), ...(entryId.current ? { autosave: true } : {}) });
    let saved: Entry;
    try {
      saved = entryId.current ? await api<Entry>(`/entries/${entryId.current}`, { method: "PATCH", ...body }) : await api<Entry>(`/shift-instances/${shiftId}/entries`, { method: "POST", ...body });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404 && entryId.current) { entryId.current = null; dirty.current = true; return; }
      if (mounted.current) setSaveState(reason instanceof ApiError && reason.status === 403 ? "closed" : "error");
      return;
    }
    entryId.current = saved.id; remember();
    if (current.images.length || current.files.length) {
      try {
        await Promise.all([...current.images.map((file) => upload(saved.id, file, "INLINE")), ...current.files.map((file) => upload(saved.id, file, "ATTACHMENT"))]);
        if (mounted.current) { setImages((pending) => pending.filter((file) => !current.images.includes(file))); setFiles((pending) => pending.filter((file) => !current.files.includes(file))); }
      } catch { if (mounted.current) setSaveState("error"); callbacks.current.onSaved(saved.id); return; }
    }
    if (mounted.current) setSaveState("saved");
    callbacks.current.onSaved(saved.id);
  }, [remember, shiftId]);

  /** Saves everything typed so far; saves never overlap and the latest text always wins. */
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (saving.current) { await saving.current; }
    if (!dirty.current) return;
    const run = (async () => { while (dirty.current) { dirty.current = false; await saveOnce(); } })().finally(() => { saving.current = null; });
    saving.current = run;
    await run;
  }, [saveOnce]);

  const changed = useCallback(() => {
    dirty.current = true; remember();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, AUTOSAVE_DELAY_MS);
  }, [flush, remember]);

  /** Completes the entry being typed and leaves an empty composer for the next one. */
  const finish = useCallback(async () => {
    dirty.current = true;
    await flush();
    if (!entryId.current) return false;
    entryId.current = null; emptyEnterRow.current = null;
    editorRef.current?.commands.clearContent(); snapshot.current = { html: "", text: "", json: undefined }; setTodos([newTodoDraft()]); setType("UPDATE"); setMenu(false); setMentionMenu(false);
    localStorage.removeItem(storageKey); dirty.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (mounted.current) setSaveState("idle");
    callbacks.current.onSaved(null);
    setTimeout(() => { if (mounted.current) editorRef.current?.commands.focus(); });
    return true;
  }, [flush, storageKey]);
  callbacks.current.finish = finish; callbacks.current.changed = changed; callbacks.current.flush = flush;

  // A draft that never reached the server (for example after a failed save) is saved when the composer opens.
  useEffect(() => { if (!editor || entryId.current) return; snapshot.current = { html: editor.getHTML(), text: editor.getText(), json: editor.getJSON() as EditorNode }; if (editor.getText().trim() || latest.current.todos.some((item) => item.text.trim())) changed(); }, [changed, editor]);
  // Nothing typed is lost when the composer goes away or the tab is hidden.
  useEffect(() => { const hidden = () => { if (document.visibilityState === "hidden") void flush(); }; document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden); }, [flush]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void flush(); }; }, [flush]);

  function updateTodos(next: (current: TodoDraft[]) => TodoDraft[]) { setTodos((current) => { const value = next(current); latest.current = { ...latest.current, todos: value }; return value; }); changed(); }
  function choose(next: EntryType) { setType(next); latest.current = { ...latest.current, type: next }; setMenu(false); if (editor?.getText().trim() === "/") editor.commands.clearContent(); if (next !== "TODO") editor?.commands.focus(); changed(); }
  function mention(displayName: string) { editor?.chain().focus().insertContent(`${displayName} `).run(); setMentionMenu(false); }
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
    if ((entryId.current || todos.some((item) => item.text.trim())) && !(await finish())) return;
    setTodos([newTodoDraft()]); setType("UPDATE"); latest.current = { ...latest.current, type: "UPDATE", todos: [] }; remember(); setTimeout(() => editor?.commands.focus());
  }
  async function handover() { dirty.current = true; await flush(); onHandover(); }
  function attach(kind: "image" | "file", added: File[]) { if (kind === "image") setImages((current) => { const value = [...current, ...added]; latest.current = { ...latest.current, images: value }; return value; }); else setFiles((current) => { const value = [...current, ...added]; latest.current = { ...latest.current, files: value }; return value; }); changed(); }

  return <section className="entry-composer" aria-label="Shift update composer"><div className="composer-body">{type === "TODO" ? <div className="todo-editor"><header><strong>To-do list</strong><button type="button" className="icon-button small" onClick={() => void closeTodoBlock()} aria-label="Close to-do list"><X /></button></header>{todos.map((item, index) => <div className="todo-editor-row" key={item.id}><input type="checkbox" disabled aria-label={`To-do item ${index + 1}`} /><input aria-label={`To-do text ${index + 1}`} data-todo-id={item.id} value={item.text} onChange={(event) => { emptyEnterRow.current = null; const text = event.target.value; updateTodos((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, text } : currentItem)); }} onKeyDown={(event) => { if (event.key === "Enter" || (event.key === "Backspace" && !event.currentTarget.value)) { event.preventDefault(); todoKey(item.id, event.key); } }} onBlur={() => void flush()} placeholder={index === 0 ? "Add a to-do and press Enter" : "Another to-do"} /><button type="button" className="icon-button small remove-todo" onClick={() => removeTodo(item.id)} aria-label={`Remove to-do ${index + 1}`}><X /></button></div>)}</div> : <EditorContent editor={editor} />}{menu && <div className="slash-menu" role="menu" aria-label="Insert action">{actions.map((action) => <button key={action.type} role="menuitem" onClick={() => choose(action.type)}><action.icon /><span><strong>{action.label}</strong><small>{action.help}</small></span></button>)}</div>}{mentionMenu && team.length > 0 && <div className="slash-menu mention-menu" role="menu" aria-label="Mention teammate">{team.map((member) => <button key={member.id} role="menuitem" onClick={() => mention(member.displayName)}><span><strong>@{member.displayName}</strong></span></button>)}</div>}{images.length > 0 && <div className="image-previews">{images.map((file, index) => <figure key={`${file.name}-${index}`}><img src={URL.createObjectURL(file)} alt={file.name} /><figcaption>{file.name}</figcaption></figure>)}</div>}{files.length > 0 && <ul className="pending-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Paperclip /> {file.name}</li>)}</ul>}</div><footer><div className="composer-tools"><button className="icon-button" onClick={() => fileInput.current?.click()} aria-label="Attach file"><Paperclip /></button><button className="icon-button" onClick={() => imageInput.current?.click()} aria-label="Add image"><Image /></button><input ref={fileInput} hidden type="file" onChange={(event) => attach("file", Array.from(event.target.files ?? []))} /><input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => attach("image", Array.from(event.target.files ?? []))} /></div><div className="composer-actions"><span role="status" className={`save-state ${saveState}`}>{(images.length > 0 || files.length > 0) && saveState === "idle" ? "Add text to save the attachment" : statusText[saveState]}</span><button className="primary-button handover-button" onClick={() => void handover()}><ArrowRight /> Handover</button></div></footer></section>;
}
