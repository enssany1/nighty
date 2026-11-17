export interface ClockShift {
  position: number;
  startMinute: number;
  endMinute: number;
}

export interface OperationalMoment {
  operationalDate: string;
  position: number;
}

function localParts(now: Date, timezone: string): { date: string; minute: number } {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    return { date: `${value("year")}-${value("month")}-${value("day")}`, minute: Number(value("hour")) * 60 + Number(value("minute")) };
  };
  try { return read(timezone); } catch { return read("UTC"); }
}

/**
 * Resolves which operational date and shift position a wall-clock instant belongs to.
 * The operational day starts with the first shift, so the hours before that start
 * still belong to the previous operational date.
 */
export function resolveOperationalMoment(now: Date, timezone: string, shifts: ClockShift[]): OperationalMoment | null {
  if (shifts.length === 0) return null;
  const ordered = [...shifts].sort((left, right) => left.position - right.position);
  const boundary = ordered[0]!.startMinute;
  const local = localParts(now, timezone);
  const calendar = new Date(`${local.date}T00:00:00.000Z`);
  if (local.minute < boundary) calendar.setUTCDate(calendar.getUTCDate() - 1);
  const offset = (local.minute - boundary + 1440) % 1440;
  let chosen: { position: number; startOffset: number } | undefined;
  for (const shift of ordered) {
    const startOffset = (shift.startMinute - boundary + 1440) % 1440;
    const duration = (shift.endMinute - shift.startMinute + 1440) % 1440 || 1440;
    if (offset < startOffset || offset >= startOffset + duration) continue;
    if (!chosen || startOffset > chosen.startOffset) chosen = { position: shift.position, startOffset };
  }
  return { operationalDate: calendar.toISOString().slice(0, 10), position: chosen?.position ?? ordered[0]!.position };
}
