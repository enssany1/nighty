import { ArrowRight, CheckCircle, Lock, Moon, Sun, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "../api/client";
import { EntryComposer } from "../editor/EntryComposer";
import { EntryView } from "./EntryView";
import { minutes, type Canvas } from "./types";

export function DailyCanvas({ date, onCurrentDay }: { date: string; onCurrentDay(): void }) {
  const [canvas, setCanvas] = useState<Canvas | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState(""); const [editingId, setEditingId] = useState<string | null>(null);
  const request = useRef(0);
  // A silent load refreshes the board in place, so the composer keeps its focus and text while entries autosave.
  const load = useCallback((silent = false) => {
    const sequence = ++request.current;
    if (!silent) { setLoading(true); setError(""); }
    return api<Canvas>(`/canvas/${date}`)
      .then((value) => { if (sequence === request.current) { setCanvas(value); setError(""); } })
      .catch((reason) => { if (sequence === request.current && !silent) setError(reason instanceof Error ? reason.message : "Canvas could not be loaded"); })
      .finally(() => { if (sequence === request.current) setLoading(false); });
  }, [date]);
  useEffect(() => { setCanvas(null); setNotice(""); setEditingId(null); void load(); return () => { request.current += 1; }; }, [load]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(true); }; window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [load]);
  async function handover(shiftId: string) {
    if (!window.confirm("Complete this shift and open the next shift? Open Follow actions will move automatically.")) return;
    const result = await api<{ transferredFollowCount: number }>(`/shift-instances/${shiftId}/handover`, { method: "POST" }); setNotice(`Handover complete. ${result.transferredFollowCount} Follow action${result.transferredFollowCount === 1 ? "" : "s"} transferred.`); await load(true); onCurrentDay();
  }
  const heading = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (loading && !canvas) return <main className="daily-canvas loading-canvas" aria-live="polite">Loading operational day…</main>;
  if (error && !canvas) return <main className="daily-canvas"><header className="canvas-heading"><div><div className="eyebrow">Operational day</div><h1>{heading}</h1></div></header><div className="empty-state"><WarningCircle size={28} /><h2>No canvas for this day</h2><p>{error}</p><button className="secondary-button" onClick={() => { onCurrentDay(); void load(); }}>Return to current day</button></div></main>;
  return <main className="daily-canvas"><header className="canvas-heading"><div><div className="eyebrow">Operational day</div><h1>{heading}</h1></div><span>24-hour coverage · Handover when ready</span></header>{notice && <div className="notice canvas-notice" role="status">{notice}</div>}<div className="shift-stream">{canvas?.shifts.map((shift, index) => <section key={shift.id} className={`shift-section ${shift.status.toLowerCase()}`} aria-labelledby={`shift-${shift.id}`}><header><div className="shift-title">{index === 0 ? <Sun aria-hidden="true" /> : index === canvas.shifts.length - 1 ? <Moon aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}<div><h2 id={`shift-${shift.id}`}>{shift.name} · {minutes(shift.startMinute)}–{minutes(shift.endMinute)}</h2><small>{shift.status === "ACTIVE" ? "Current shift" : shift.status === "CLOSED" ? "Previous shift" : "Upcoming shift"}</small></div></div><span className={`status-pill ${shift.status.toLowerCase()}`}>{shift.status === "ACTIVE" ? <CheckCircle /> : <Lock />}{shift.status[0] + shift.status.slice(1).toLowerCase()}</span></header><div className="shift-content">{shift.incomingFollows?.length > 0 && <section className="incoming-follows" aria-label="Follow actions from previous shift"><strong>Carried-over Follow work</strong>{shift.incomingFollows.map((follow) => { const completed = follow.status === "COMPLETED"; return <div className={`incoming-follow ${completed ? "completed" : ""}`} key={follow.transferId}><label><input type="checkbox" aria-label={follow.entry.plainText} checked={completed} disabled={completed || !shift.writable} onChange={(event) => event.target.checked && void api(`/follows/${follow.transferId}/status`, { method: "PATCH", ...jsonBody({ status: "COMPLETED" }) }).then(() => load(true))} /><span>{follow.entry.plainText}</span></label>{completed && follow.completedBy && follow.completedAt && <small>Completed by {follow.completedBy.displayName} · {new Date(follow.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</small>}</div>; })}</section>}{shift.entries.length ? shift.entries.map((entry) => <EntryView key={entry.id} entry={entry} writable={shift.writable} editing={entry.id === editingId} onChange={() => void load(true)} />) : <p className="no-entries">No entries recorded for this shift.</p>}{shift.writable && <EntryComposer shiftId={shift.id} operationalDate={date} onSaved={(entryId) => { setEditingId(entryId); void load(true); }} onHandover={() => void handover(shift.id)} />}{!shift.writable && shift.status !== "CLOSED" && <div className="read-only-note"><Lock /> Read-only until Handover opens this shift</div>}</div></section>)}</div></main>;
}
