import { ArrowRight, CheckSquare, FileArrowUp, Image, Paperclip, TextT, X } from "@phosphor-icons/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, jsonBody } from "../api/client";
import type { Entry, EntryType, TodoItem } from "../operations/types";

const actions: Array<{ type: EntryType; label: string; icon: typeof TextT; help: string }> = [
  { type: "UPDATE", label: "Update", icon: TextT, help: "Record progress or context" },
  { type: "TODO", label: "To-do list", icon: CheckSquare, help: "Add checkbox actions" },
  { type: "FOLLOW", label: "Follow", icon: ArrowRight, help: "Transfer automatically at Handover" },
];
const keyFor = (date: string, shiftId: string) => `nighty:draft:${date}:${shiftId}`;
type TodoDraft = { id: string; text: string };
let todoDraftSequence = 0;
const newTodoDraft = (text = ""): TodoDraft => ({ id: `todo-draft-${++todoDraftSequence}`, text });

async function upload(parentId: string, file: File, disposition: "INLINE" | "ATTACHMENT") {
  const body = new FormData(); body.append("file", file); body.append("parentType", "entry"); body.append("parentId", parentId); body.append("disposition", disposition);
  return api("/attachments", { method: "POST", body });
}

export function EntryComposer({ shiftId, operationalDate, onSubmitted, onHandover }: { shiftId: string; operationalDate: string; onSubmitted(): void; onHandover(): void; }) {
  const storageKey = keyFor(operationalDate, shiftId); const restored = useMemo(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as { html?: string; type?: EntryType; todos?: string[] } | null; } catch { return null; } }, [storageKey]);
  const [type, setType] = useState<EntryType>(restored?.type ?? "UPDATE"); const [todos, setTodos] = useState<TodoDraft[]>(() => (restored?.todos?.length ? restored.todos : [""]).map(newTodoDraft)); const [images, setImages] = useState<File[]>([]); const [files, setFiles] = useState<File[]>([]); const [menu, setMenu] = useState(false); const [mentionMenu, setMentionMenu] = useState(false); const [team, setTeam] = useState<Array<{id:string;displayName:string}>>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const fileInput = useRef<HTMLInputElement>(null); const imageInput = useRef<HTMLInputElement>(null); const submitButton = useRef<HTMLButtonElement>(null); const emptyEnterRow = useRef<string | null>(null);
  useEffect(() => { api<Array<{id:string;displayName:string}>>("/team").then(setTeam).catch(() => undefined); }, []);
  const editor = useEditor({ extensions: [StarterKit], content: restored?.html ?? "", editorProps: { attributes: { class: "tiptap-editor", "aria-label": "Write an update" }, handlePaste: (_view, event) => { const pasted = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/")); if (!pasted.length) return false; setImages((current) => [...current, ...pasted]); return true; } }, onUpdate: ({ editor: current }) => { const text = current.getText(); setMenu(text.trimEnd().endsWith("/")); setMentionMenu(text.trimEnd().endsWith("@")); localStorage.setItem(storageKey, JSON.stringify({ html: current.getHTML(), type, todos: todos.map((item) => item.text) })); } });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify({ html: editor?.getHTML() ?? "", type, todos: todos.map((item) => item.text) })); }, [editor, storageKey, todos, type]);
  function choose(next: EntryType) { setType(next); setMenu(false); if (editor?.getText().trim() === "/") editor.commands.clearContent(); editor?.commands.focus(); }
  function mention(displayName:string) { editor?.chain().focus().insertContent(`${displayName} `).run(); setMentionMenu(false); }
  function removeTodo(id: string) {
    setTodos((current) => current.length === 1 ? [newTodoDraft()] : current.filter((item) => item.id !== id));
    emptyEnterRow.current = null;
  }
  function todoKey(id: string, key: string) {
    const index = todos.findIndex((item) => item.id === id);
    if (index < 0) return;
    if (key === "Backspace" && !todos[index]?.text) { removeTodo(id); return; }
    if (key !== "Enter") return;
    if (!todos[index]?.text.trim()) {
      if (emptyEnterRow.current !== id) { emptyEnterRow.current = id; return; }
      emptyEnterRow.current = null;
      setTodos((current) => current.length === 1 ? current : current.filter((item) => item.id !== id));
      setTimeout(() => submitButton.current?.focus());
      return;
    }
    const added = newTodoDraft();
    emptyEnterRow.current = null;
    setTodos((current) => [...current.slice(0, index + 1), added, ...current.slice(index + 1)]);
    setTimeout(() => (document.querySelector(`[data-todo-id="${added.id}"]`) as HTMLInputElement | null)?.focus());
  }
  function removeTodoBlock() { setTodos([newTodoDraft()]); setType("UPDATE"); setMessage(""); setTimeout(() => editor?.commands.focus()); }
  async function submit() {
    if (busy) return; const editorText = editor?.getText().trim() ?? ""; const normalizedTodos: TodoItem[] = todos.map((item) => item.text.trim()).filter(Boolean).map((text, index) => ({ text, completed: false, position: index + 1 })); const plainText = type === "TODO" ? normalizedTodos.map((item) => item.text).join("\n") : editorText;
    if (type === "TODO" ? normalizedTodos.length === 0 : !plainText) { setMessage(type === "TODO" ? "Add at least one to-do item." : "Write something before submitting."); return; }
    setBusy(true); setMessage("");
    try { const entry = await api<Entry>(`/shift-instances/${shiftId}/entries`, { method: "POST", ...jsonBody({ type, editorDocument: editor?.getJSON(), plainText, ...(type === "TODO" ? { todoItems: normalizedTodos } : {}) }) }); await Promise.all([...images.map((file) => upload(entry.id, file, "INLINE")), ...files.map((file) => upload(entry.id, file, "ATTACHMENT"))]); editor?.commands.clearContent(); setTodos([newTodoDraft()]); setImages([]); setFiles([]); localStorage.removeItem(storageKey); setMessage("Submitted."); onSubmitted(); } catch (reason) { setMessage(reason instanceof ApiError && reason.status === 400 ? "Check the entry and try again." : "Could not submit. Your draft is saved."); } finally { setBusy(false); }
  }
  return <section className="entry-composer" aria-label="Shift update composer"><div className="composer-body">{type === "TODO" ? <div className="todo-editor"><header><strong>To-do list</strong><button type="button" className="icon-button small" onClick={removeTodoBlock} aria-label="Remove to-do list"><X /></button></header>{todos.map((item, index) => <div className="todo-editor-row" key={item.id}><input type="checkbox" disabled aria-label={`To-do item ${index + 1}`} /><input aria-label={`To-do text ${index + 1}`} data-todo-id={item.id} value={item.text} onChange={(event) => { emptyEnterRow.current = null; setTodos((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, text: event.target.value } : currentItem)); }} onKeyDown={(event) => { if (event.key === "Enter" || (event.key === "Backspace" && !event.currentTarget.value)) { event.preventDefault(); todoKey(item.id, event.key); } }} placeholder={index === 0 ? "Add a to-do and press Enter" : "Another to-do"} /><button type="button" className="icon-button small remove-todo" onClick={() => removeTodo(item.id)} aria-label={`Remove to-do ${index + 1}`}><X /></button></div>)}</div> : <EditorContent editor={editor} />}{menu && <div className="slash-menu" role="menu" aria-label="Insert action">{actions.map((action) => <button key={action.type} role="menuitem" onClick={() => choose(action.type)}><action.icon /><span><strong>{action.label}</strong><small>{action.help}</small></span></button>)}</div>}{mentionMenu && team.length>0 && <div className="slash-menu mention-menu" role="menu" aria-label="Mention teammate">{team.map((member)=><button key={member.id} role="menuitem" onClick={()=>mention(member.displayName)}><span><strong>@{member.displayName}</strong></span></button>)}</div>}{images.length > 0 && <div className="image-previews">{images.map((file, index) => <figure key={`${file.name}-${index}`}><img src={URL.createObjectURL(file)} alt={file.name} /><figcaption>{file.name}</figcaption></figure>)}</div>}{files.length > 0 && <ul className="pending-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Paperclip /> {file.name}</li>)}</ul>}</div><footer><div className="composer-tools"><button className="icon-button" onClick={() => fileInput.current?.click()} aria-label="Attach file"><Paperclip /></button><button className="icon-button" onClick={() => imageInput.current?.click()} aria-label="Add image"><Image /></button><input ref={fileInput} hidden type="file" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /><input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => setImages((current) => [...current, ...Array.from(event.target.files ?? [])])} /><span className={`action-badge ${type.toLowerCase()}`}><FileArrowUp /> {actions.find((action) => action.type === type)?.label}</span></div><div className="composer-actions"><span role="status">{message || "Draft saved locally"}</span><button ref={submitButton} className="secondary-button" onClick={() => void submit()} disabled={busy}>{busy ? "Submitting…" : "Submit"}</button><button className="primary-button handover-button" onClick={onHandover}><ArrowRight /> Handover</button></div></footer></section>;
}
