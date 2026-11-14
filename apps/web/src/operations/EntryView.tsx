import { ArrowBendDownRight, CheckSquare, FileText, Paperclip, TextT } from "@phosphor-icons/react";
import { api, jsonBody } from "../api/client";
import type { Entry } from "./types";

const meta = { UPDATE: { label: "Update", icon: TextT }, TODO: { label: "To-do list", icon: CheckSquare }, FOLLOW: { label: "Follow", icon: ArrowBendDownRight } } as const;
export function EntryView({ entry, writable, onChange }: { entry: Entry; writable: boolean; onChange(): void }) {
  const style = meta[entry.type]; const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <article className={`entry-row entry-${entry.type.toLowerCase()}`} id={`entry-${entry.id}`}><time>{time}</time><span className="entry-label"><style.icon /> {style.label}</span><div className="entry-content">{entry.type === "TODO" ? <ul className="todo-list">{entry.todoItems.map((item) => <li key={item.id ?? item.position}><label><input type="checkbox" checked={Boolean(item.completed)} disabled={!writable || !item.id} onChange={(event) => item.id && void api(`/todo-items/${item.id}`, { method: "PATCH", ...jsonBody({ completed: event.target.checked }) }).then(onChange)} /><span>{item.text}</span></label></li>)}</ul> : <p>{entry.plainText}</p>}{entry.attachments?.filter((item) => item.disposition === "INLINE").map((item) => <img className="inline-entry-image" key={item.id} src={item.downloadUrl} alt={item.originalName} />)}{entry.attachments?.filter((item) => item.disposition === "ATTACHMENT").map((item) => <a className="attachment-link" key={item.id} href={item.downloadUrl} download><Paperclip /> {item.originalName}</a>)}<small className="entry-author">{entry.author?.displayName ?? "Team member"}</small></div></article>;
}
