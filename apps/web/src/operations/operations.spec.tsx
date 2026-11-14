import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyCanvas } from "./DailyCanvas";

afterEach(() => vi.restoreAllMocks());
describe("daily canvas", () => {
  it("renders previous/current/upcoming states and only edits the current assigned shift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [{ id: "closed", definitionId: "d1", name: "Morning", startMinute: 420, endMinute: 900, position: 1, status: "CLOSED", writable: false, entries: [], incomingFollows: [] }, { id: "active", definitionId: "d2", name: "Evening", startMinute: 900, endMinute: 1380, position: 2, status: "ACTIVE", writable: true, entries: [], incomingFollows: [] }, { id: "upcoming", definitionId: "d3", name: "Night", startMinute: 1380, endMinute: 420, position: 3, status: "UPCOMING", writable: false, entries: [], incomingFollows: [] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<DailyCanvas date="2026-11-13" onCurrentDay={() => undefined} />);
    expect(await screen.findByRole("heading", { name: /Friday, November 13, 2026|Friday, 13 November 2026/ })).toBeInTheDocument();
    expect(screen.getByText("Current shift")).toBeInTheDocument(); expect(screen.getByText("Previous shift")).toBeInTheDocument(); expect(screen.getByText("Upcoming shift")).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Handover/ })).toBeInTheDocument();
  });
});
