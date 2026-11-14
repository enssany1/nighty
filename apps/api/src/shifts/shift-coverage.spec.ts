import { validateCoverage } from "./shift-coverage";

describe("validateCoverage", () => {
  it("accepts the approved overnight schedule", () => {
    expect(validateCoverage([
      { startMinute: 420, endMinute: 900, active: true },
      { startMinute: 900, endMinute: 1380, active: true },
      { startMinute: 1380, endMinute: 420, active: true },
    ])).toEqual({ valid: true });
  });

  it("accepts one or many overlaps", () => {
    expect(validateCoverage([
      { startMinute: 0, endMinute: 720, active: true },
      { startMinute: 600, endMinute: 1200, active: true },
      { startMinute: 720, endMinute: 1439, active: true },
      { startMinute: 1200, endMinute: 0, active: true },
      { startMinute: 1439, endMinute: 600, active: true },
    ])).toEqual({ valid: true });
  });

  it("returns an exact one-minute gap and ignores inactive definitions", () => {
    expect(validateCoverage([
      { startMinute: 0, endMinute: 719, active: true },
      { startMinute: 720, endMinute: 0, active: true },
      { startMinute: 719, endMinute: 720, active: false },
    ])).toEqual({ valid: false, uncovered: [{ startMinute: 719, endMinute: 720 }] });
  });

  it("treats a zero-duration shift as covering no minutes", () => {
    expect(validateCoverage([{ startMinute: 420, endMinute: 420, active: true }])).toEqual({
      valid: false,
      uncovered: [{ startMinute: 0, endMinute: 1440 }],
    });
  });
});
