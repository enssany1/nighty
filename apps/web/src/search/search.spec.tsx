import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./SearchPanel";

afterEach(() => vi.restoreAllMocks());
describe("search", () => {
  it("returns a stable canvas destination from combined filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("[]", { status: 200 })).mockResolvedValueOnce(new Response("[]", { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ entryId: "e1", shiftInstanceId: "s1", operationalDate: "2026-11-13", shiftName: "Evening", author: { displayName: "Aisha" }, createdAt: "2026-11-13T16:00:00Z", type: "FOLLOW", followStatus: "OPEN", plainText: "Monitor API", tags: [] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const open = vi.fn(); render(<SearchPanel tags={[]} onClose={() => undefined} onOpen={open} />); fireEvent.change(screen.getByLabelText("Search text"), { target: { value: "API" } }); fireEvent.click(screen.getByRole("button", { name: "Search" })); const result = await screen.findByText("Monitor API"); fireEvent.click(result.closest("button")!); expect(open).toHaveBeenCalledWith("2026-11-13", "e1"); expect(fetchMock.mock.calls[2]?.[0]).toContain("q=API");
  });
});
