import { Gear, SidebarSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody, type Session } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ProfilePanel } from "../profile/ProfilePanel";
import { SearchPanel } from "../search/SearchPanel";
import { TagWhiteboard } from "../tags/TagWhiteboard";
import { DailyCanvas } from "./DailyCanvas";
import { OperationsSidebar } from "./OperationsSidebar";
import type { Tag } from "./types";

export function OperationsWorkspace({ session, onSettings }: { session: Session; onSettings(): void }) {
  const { logout } = useAuth(); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [tags, setTags] = useState<Tag[]>([]); const [tagId, setTagId] = useState<string | null>(null); const [search, setSearch] = useState(false); const [profile, setProfile] = useState(false); const [collapsed, setCollapsed] = useState(() => localStorage.getItem("nighty:sidebar-collapsed") === "true"); const [narrow, setNarrow] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches); const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null); const stageRef = useRef<HTMLDivElement>(null); const openerRef = useRef<HTMLButtonElement>(null); const drawerWasOpen = useRef(false); const restoreDrawerFocus = useRef(true);
  const loadTags = useCallback(() => api<Tag[]>("/tags").then(setTags).catch(() => undefined), []);
  const current = useCallback(() => api<{ operationalDate: string }>("/operational-days/current").then((value) => setDate(value.operationalDate)).catch(() => undefined), []);
  useEffect(() => { current(); loadTags(); const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (narrow && drawerOpen) { restoreDrawerFocus.current = false; setDrawerOpen(false); } setSearch(true); } }; window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard); }, [current, drawerOpen, loadTags, narrow]);
  useEffect(() => { if (typeof window.matchMedia !== "function") return; const media = window.matchMedia("(max-width: 720px)"); const changed = () => { setNarrow(media.matches); if (!media.matches) setDrawerOpen(false); }; media.addEventListener("change", changed); return () => media.removeEventListener("change", changed); }, []);
  useEffect(() => {
    if (!narrow) return;
    if (!drawerOpen) {
      stageRef.current?.removeAttribute("inert");
      if (drawerWasOpen.current && restoreDrawerFocus.current) setTimeout(() => openerRef.current?.focus());
      restoreDrawerFocus.current = true;
      drawerWasOpen.current = false;
      return;
    }
    drawerWasOpen.current = true;
    const sidebar = sidebarRef.current; const stage = stageRef.current; const previousOverflow = document.body.style.overflow;
    stage?.setAttribute("inert", ""); document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? []);
    setTimeout(() => focusable()[0]?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDrawerOpen(false); return; }
      if (event.key !== "Tab") return;
      const controls = focusable(); if (!controls.length) return;
      const first = controls[0]!; const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("keydown", keyboard); stage?.removeAttribute("inert"); document.body.style.overflow = previousOverflow; };
  }, [drawerOpen, narrow]);
  const sidebarVisible = narrow ? drawerOpen : !collapsed;
  function closeSidebar() { if (narrow) { restoreDrawerFocus.current = true; setDrawerOpen(false); } else { setCollapsed(true); localStorage.setItem("nighty:sidebar-collapsed", "true"); } }
  function openSidebar() { if (narrow) { restoreDrawerFocus.current = true; setDrawerOpen(true); } else { setCollapsed(false); localStorage.setItem("nighty:sidebar-collapsed", "false"); } }
  function openSearch() { if (narrow && drawerOpen) { restoreDrawerFocus.current = false; setDrawerOpen(false); } setSearch(true); }
  function openProfile() { if (narrow && drawerOpen) { restoreDrawerFocus.current = false; setDrawerOpen(false); } setProfile(true); }
  async function addTag() { const name = window.prompt("New Tag name"); if (!name) return; const tag = await api<Tag>("/tags", { method: "POST", ...jsonBody({ name }) }); await loadTags(); setTagId(tag.id); }
  const selectedTag = tags.find((tag) => tag.id === tagId);
  return <div className={`workspace-shell operations-layout ${collapsed ? "sidebar-collapsed" : ""} ${drawerOpen ? "drawer-open" : ""}`}>{sidebarVisible && <OperationsSidebar session={session} selectedDate={date} tags={tags} activeTagId={tagId} closeLabel={narrow ? "Close left menu" : "Collapse left menu"} modal={narrow} sidebarRef={sidebarRef} onClose={closeSidebar} onDate={(value) => { setDate(value); setTagId(null); if (narrow) setDrawerOpen(false); }} onSearch={openSearch} onTag={(id) => { setTagId(id); if (narrow) setDrawerOpen(false); }} onAddTag={() => void addTag()} onProfile={openProfile} onLogout={() => void logout()} />}{narrow && drawerOpen && <button className="sidebar-backdrop" tabIndex={-1} aria-label="Close left menu" onClick={closeSidebar} /> }<div ref={stageRef} className="operations-stage" aria-hidden={narrow && drawerOpen ? true : undefined}>{!sidebarVisible && <button ref={openerRef} className="sidebar-open-button" onClick={openSidebar} aria-label="Show left menu" aria-expanded={drawerOpen} aria-controls="operations-sidebar"><SidebarSimple /> <span>Menu</span></button>}{session.role === "ADMIN" && <button className="floating-settings" onClick={onSettings}><Gear /> Settings</button>}{selectedTag ? <TagWhiteboard tag={selectedTag} role={session.role} onRenamed={loadTags} /> : <DailyCanvas date={date} onCurrentDay={current} />}</div>{search && <SearchPanel tags={tags} onClose={() => setSearch(false)} onOpen={(nextDate, entryId) => { setDate(nextDate); setTagId(null); setSearch(false); setTimeout(() => document.getElementById(`entry-${entryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 500); }} />}{profile && <ProfilePanel onClose={() => setProfile(false)} />}</div>;
}
