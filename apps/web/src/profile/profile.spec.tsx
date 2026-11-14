import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
afterEach(() => vi.restoreAllMocks());

describe("profile", () => {
  it("shows immutable account facts and hides administrator navigation from operators", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => { const url = String(request); if (url.includes("/auth/me")) return reply({ userId: "u2", displayName: "Marcus", role: "OPERATOR", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() }); if (url.includes("/operational-days/current")) return reply({ operationalDate: "2026-11-13" }); if (url.includes("/tags")) return reply([]); if (url.includes("/canvas/")) return reply({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [] }); if (url.includes("/profile")) return reply({ id: "u2", username: "marcus", displayName: "Marcus", role: "OPERATOR", shiftIds: [] }); return reply({}); });
    render(<App />); expect(await screen.findByText("Marcus")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Settings/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Marcus/ })); expect(await screen.findByDisplayValue("marcus")).toBeInTheDocument(); expect(screen.getByDisplayValue("Operator")).toBeInTheDocument();
  });
});
