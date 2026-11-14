import { nextOperationalDate } from "./handover.service";

describe("handover helpers", () => {
  it("resolves the next calendar date across month and year boundaries", () => {
    expect(nextOperationalDate(new Date("2026-12-31T00:00:00.000Z"))).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });
});
