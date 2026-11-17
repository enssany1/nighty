import { resolveOperationalMoment } from "./operational-clock";

const schedule = [
  { position: 1, startMinute: 420, endMinute: 900 },   // Morning 07:00–15:00
  { position: 2, startMinute: 900, endMinute: 1380 },  // Evening 15:00–23:00
  { position: 3, startMinute: 1380, endMinute: 420 },  // Night 23:00–07:00
];

describe("resolveOperationalMoment", () => {
  it("uses the configured time zone, not UTC, to pick the operational date and shift", () => {
    // 05:00 UTC is 09:00 in Muscat: Morning shift of the same calendar day.
    expect(resolveOperationalMoment(new Date("2026-11-17T05:00:00.000Z"), "Asia/Muscat", schedule)).toEqual({ operationalDate: "2026-11-17", position: 1 });
    // 20:30 UTC is 00:30 next day in Muscat: still the Night shift of the 17th.
    expect(resolveOperationalMoment(new Date("2026-11-17T20:30:00.000Z"), "Asia/Muscat", schedule)).toEqual({ operationalDate: "2026-11-17", position: 3 });
  });

  it("keeps the hours before the first shift on the previous operational date", () => {
    expect(resolveOperationalMoment(new Date("2026-11-17T06:59:00.000Z"), "UTC", schedule)).toEqual({ operationalDate: "2026-11-16", position: 3 });
    expect(resolveOperationalMoment(new Date("2026-11-17T07:00:00.000Z"), "UTC", schedule)).toEqual({ operationalDate: "2026-11-17", position: 1 });
    expect(resolveOperationalMoment(new Date("2027-01-01T03:00:00.000Z"), "UTC", schedule)).toEqual({ operationalDate: "2026-12-31", position: 3 });
  });

  it("prefers the most recently started shift when shifts overlap", () => {
    const overlapping = [
      { position: 1, startMinute: 420, endMinute: 960 },  // 07:00–16:00
      { position: 2, startMinute: 900, endMinute: 1380 }, // 15:00–23:00
      { position: 3, startMinute: 1380, endMinute: 450 }, // 23:00–07:30
    ];
    expect(resolveOperationalMoment(new Date("2026-11-17T15:30:00.000Z"), "UTC", overlapping)).toEqual({ operationalDate: "2026-11-17", position: 2 });
    // 07:15 is covered by yesterday's Night overlap, but today's operational day starts with Morning.
    expect(resolveOperationalMoment(new Date("2026-11-17T07:15:00.000Z"), "UTC", overlapping)).toEqual({ operationalDate: "2026-11-17", position: 1 });
  });

  it("falls back to UTC for an unknown time zone and returns null without shifts", () => {
    expect(resolveOperationalMoment(new Date("2026-11-17T10:00:00.000Z"), "Not/AZone", schedule)).toEqual({ operationalDate: "2026-11-17", position: 1 });
    expect(resolveOperationalMoment(new Date("2026-11-17T10:00:00.000Z"), "UTC", [])).toBeNull();
  });
});
