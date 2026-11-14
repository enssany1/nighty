import { Gear } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody, type Session } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ProfilePanel } from "../profile/ProfilePanel";
import { SearchPanel } from "../search/SearchPanel";
import { TagWhiteboard } from "../tags/TagWhiteboard";
import { DailyCanvas } from "./DailyCanvas";
import { OperationsSidebar } from "./OperationsSidebar";
import type { Tag } from "./types";

export function OperationsWorkspace({ session, onSettings }: { session: Session; onSettings(): void }) {
  const { logout } = useAuth(); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [tags, setTags] = useState<Tag[]>([]); const [tagId, setTagId] = useState<string | null>(null); const [search, setSearch] = useState(false); const [profile, setProfile] = useState(false);
  const loadTags = useCallback(() => api<Tag[]>("/tags").then(setTags).catch(() => undefined), []);
  const current = useCallback(() => api<{ operationalDate: string }>("/operational-days/current").then((value) => setDate(value.operationalDate)).catch(() => undefined), []);
  useEffect(() => { current(); loadTags(); const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); } }; window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard); }, [current, loadTags]);
  async function addTag() { const name = window.prompt("New Tag name"); if (!name) return; const tag = await api<Tag>("/tags", { method: "POST", ...jsonBody({ name }) }); await loadTags(); setTagId(tag.id); }
  const selectedTag = tags.find((tag) => tag.id === tagId);
  return <div className="workspace-shell operations-layout"><OperationsSidebar session={session} selectedDate={date} tags={tags} activeTagId={tagId} onDate={(value) => { setDate(value); setTagId(null); }} onSearch={() => setSearch(true)} onTag={setTagId} onAddTag={() => void addTag()} onProfile={() => setProfile(true)} onLogout={() => void logout()} /><div className="operations-stage">{session.role === "ADMIN" && <button className="floating-settings" onClick={onSettings}><Gear /> Settings</button>}{selectedTag ? <TagWhiteboard tag={selectedTag} role={session.role} onRenamed={loadTags} /> : <DailyCanvas date={date} onCurrentDay={current} />}</div>{search && <SearchPanel tags={tags} onClose={() => setSearch(false)} onOpen={(nextDate, entryId) => { setDate(nextDate); setTagId(null); setSearch(false); setTimeout(() => document.getElementById(`entry-${entryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 500); }} />}{profile && <ProfilePanel onClose={() => setProfile(false)} />}</div>;
}
