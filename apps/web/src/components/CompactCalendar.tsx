import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
export function CompactCalendar({ selected, onSelect }: { selected: string; onSelect(value: string): void }) {
  const selectedDate = new Date(`${selected}T00:00:00Z`); const [view, setView] = useState(() => new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1)));
  const days = useMemo(() => { const first = view.getUTCDay(); return Array.from({ length: 42 }, (_, index) => { const date = new Date(view); date.setUTCDate(index - first + 1); return date; }); }, [view]);
  const move = (offset: number) => setView(new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + offset, 1)));
  return <section className="compact-calendar" aria-label="Operational day calendar"><header><strong>{view.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</strong><span><button className="icon-button small" onClick={() => move(-1)} aria-label="Previous month"><CaretLeft /></button><button className="icon-button small" onClick={() => move(1)} aria-label="Next month"><CaretRight /></button></span></header><div className="weekdays" aria-hidden="true">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{days.map((date) => { const value = iso(date); const outside = date.getUTCMonth() !== view.getUTCMonth(); return <button key={value} className={`${outside ? "outside " : ""}${value === selected ? "selected" : ""}`} aria-current={value === selected ? "date" : undefined} onClick={() => onSelect(value)}>{date.getUTCDate()}</button>; })}</div></section>;
}
