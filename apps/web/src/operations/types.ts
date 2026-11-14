export type EntryType = "UPDATE" | "TODO" | "FOLLOW";
export interface Attachment { id: string; originalName: string; mimeType: string; byteSize: number; disposition: "INLINE" | "ATTACHMENT"; downloadUrl: string; }
export interface TodoItem { id?: string; text: string; completed?: boolean; position: number; }
export interface Entry { id: string; type: EntryType; editorDocument: Record<string, unknown>; plainText: string; followStatus?: "OPEN" | "COMPLETED"; todoItems: TodoItem[]; authorId: string; author?: { id: string; displayName: string }; attachments?: Attachment[]; createdAt: string; }
export interface IncomingFollow { transferId: string; status: "OPEN" | "COMPLETED"; entry: Entry; }
export interface ShiftCanvas { id: string; definitionId: string; name: string; startMinute: number; endMinute: number; position: number; status: "UPCOMING" | "ACTIVE" | "CLOSED"; writable: boolean; entries: Entry[]; incomingFollows: IncomingFollow[]; }
export interface Canvas { operationalDayId: string; operationalDate: string; shifts: ShiftCanvas[]; }
export interface Tag { id: string; name: string; position: number; status?: "ACTIVE" | "ARCHIVED"; archived?: boolean; _count?: { posts: number; entries: number }; }
export const documentFor = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
export function minutes(value: number) { const hour = Math.floor(value / 60) % 24; const minute = value % 60; return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
