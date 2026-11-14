export interface CoverageShift {
  startMinute: number;
  endMinute: number;
  active: boolean;
}

export type CoverageResult =
  | { valid: true }
  | { valid: false; uncovered: Array<{ startMinute: number; endMinute: number }> };

export function validateCoverage(shifts: CoverageShift[]): CoverageResult {
  const covered = Array<boolean>(1440).fill(false);
  for (const shift of shifts) {
    if (!shift.active || shift.startMinute === shift.endMinute) continue;
    if (!Number.isInteger(shift.startMinute) || !Number.isInteger(shift.endMinute) ||
        shift.startMinute < 0 || shift.startMinute > 1439 || shift.endMinute < 0 || shift.endMinute > 1439) continue;
    let minute = shift.startMinute;
    while (minute !== shift.endMinute) {
      covered[minute] = true;
      minute = (minute + 1) % 1440;
    }
  }
  const uncovered: Array<{ startMinute: number; endMinute: number }> = [];
  let start: number | undefined;
  for (let minute = 0; minute <= 1440; minute += 1) {
    const isCovered = minute < 1440 ? covered[minute] : true;
    if (!isCovered && start === undefined) start = minute;
    if (isCovered && start !== undefined) {
      uncovered.push({ startMinute: start, endMinute: minute });
      start = undefined;
    }
  }
  return uncovered.length === 0 ? { valid: true } : { valid: false, uncovered };
}
