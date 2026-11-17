import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { CompactCalendar } from "../components/CompactCalendar";
import { DailyCanvas } from "./DailyCanvas";
import { OperationsWorkspace } from "./OperationsWorkspace";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
describe("daily canvas", () => {
  it("renders only the week rows required by the viewed month", () => {
    render(<CompactCalendar selected="2026-11-13" onSelect={() => undefined} />);
    const cells = screen.getByLabelText("Operational day calendar").querySelectorAll(".calendar-grid button");
    expect(cells).toHaveLength(35);
    expect(cells.item(34)).toHaveTextContent("5");
  });

  it("renders previous/current/upcoming states and only edits the current assigned shift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [{ id: "closed", definitionId: "d1", name: "Morning", startMinute: 420, endMinute: 900, position: 1, status: "CLOSED", writable: false, entries: [], incomingFollows: [] }, { id: "active", definitionId: "d2", name: "Evening", startMinute: 900, endMinute: 1380, position: 2, status: "ACTIVE", writable: true, entries: [], incomingFollows: [] }, { id: "upcoming", definitionId: "d3", name: "Night", startMinute: 1380, endMinute: 420, position: 3, status: "UPCOMING", writable: false, entries: [], incomingFollows: [] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<DailyCanvas date="2026-11-13" onCurrentDay={() => undefined} />);
    expect(await screen.findByRole("heading", { name: /Friday, November 13, 2026|Friday, 13 November 2026/ })).toBeInTheDocument();
    expect(screen.getByText("Current shift")).toBeInTheDocument(); expect(screen.getByText("Previous shift")).toBeInTheDocument(); expect(screen.getByText("Upcoming shift")).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Handover/ })).toBeInTheDocument();
  });

  it("keeps a completed incoming Follow visible with completion evidence and compact entry metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [{ id: "active", definitionId: "d2", name: "Evening", startMinute: 900, endMinute: 1380, position: 2, status: "ACTIVE", writable: true, entries: [{ id: "entry", type: "TODO", editorDocument: {}, plainText: "First\nSecond", todoItems: [{ id: "one", text: "First", completed: true, position: 1 }, { id: "two", text: "Second", completed: false, position: 2 }], authorId: "u1", author: { id: "u1", displayName: "Aisha" }, attachments: [], createdAt: "2026-11-13T16:05:00Z" }], incomingFollows: [{ transferId: "transfer", status: "COMPLETED", completedAt: "2026-11-13T16:10:00Z", completedBy: { id: "u1", displayName: "Aisha" }, entry: { id: "follow", type: "FOLLOW", editorDocument: {}, plainText: "Monitor API", todoItems: [], authorId: "u2", author: { id: "u2", displayName: "Marcus" }, attachments: [], createdAt: "2026-11-13T15:20:00Z" } }] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<DailyCanvas date="2026-11-13" onCurrentDay={() => undefined} />);
    expect(await screen.findByText("Monitor API")).toBeInTheDocument();
    expect(screen.getByLabelText("Monitor API")).toBeChecked();
    expect(screen.getByText(/Completed by Aisha/)).toBeInTheDocument();
    expect(screen.getAllByText(/Aisha · \d{2}:\d{2}/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "History for To-do list" })).toBeInTheDocument();
    expect(screen.getByText("First")).toHaveClass("completed");
  });

  it("lands on the server's current operational day and never asks for the browser's calendar date", async () => {
    const session = { userId: "u1", displayName: "Aisha", role: "ADMIN" as const, csrfToken: "csrf", expiresAt: "2026-11-13T20:00:00Z" };
    const canvasRequests: string[] = [];
    const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => { const url = String(request); if (url.includes("/auth/me")) return reply(session); if (url.includes("/tags") || url.includes("/team")) return reply([]); if (url.includes("/operational-days/current")) return reply({ operationalDate: "2026-11-13" }); if (url.includes("/canvas/")) { canvasRequests.push(url.split("/canvas/")[1]!); return url.endsWith("2026-11-13") ? reply({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [] }) : reply({ message: "Operational day not found" }, 404); } return reply({}); });
    render(<AuthProvider><OperationsWorkspace session={session} onSettings={() => undefined} /></AuthProvider>);
    expect(await screen.findByRole("heading", { name: /November 13, 2026|13 November 2026/ })).toBeInTheDocument();
    expect(screen.queryByText("No canvas for this day")).not.toBeInTheDocument();
    expect(new Set(canvasRequests)).toEqual(new Set(["2026-11-13"]));
  });

  it("recovers from a missing day with Return to current day", async () => {
    let available = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(available
      ? new Response(JSON.stringify({ operationalDayId: "day", operationalDate: "2026-11-13", shifts: [] }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ message: "Operational day not found" }), { status: 404, headers: { "content-type": "application/json" } })));
    const onCurrentDay = vi.fn();
    render(<DailyCanvas date="2026-11-13" onCurrentDay={onCurrentDay} />);
    const button = await screen.findByRole("button", { name: "Return to current day" });
    available = true;
    fireEvent.click(button);
    expect(onCurrentDay).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("No canvas for this day")).not.toBeInTheDocument());
    expect(screen.getByText(/Handover when ready/)).toBeInTheDocument();
  });

  it("collapses, restores, and reopens the left menu preference", async () => {
    const session = { userId: "u1", displayName: "Aisha", role: "ADMIN" as const, csrfToken: "csrf", expiresAt: "2026-11-13T20:00:00Z" };
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => { const url=String(request); if(url.includes("/auth/me")) return Promise.resolve(new Response(JSON.stringify(session),{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/tags") || url.includes("/team") || url.includes("/shifts")) return Promise.resolve(new Response("[]",{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/profile")) return Promise.resolve(new Response(JSON.stringify({id:"u1",username:"aisha",displayName:"Aisha",role:"ADMIN",shiftIds:[]}),{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/operational-days/current")) return Promise.resolve(new Response(JSON.stringify({operationalDate:"2026-11-13"}),{status:200,headers:{"content-type":"application/json"}})); return Promise.resolve(new Response(JSON.stringify({operationalDayId:"day",operationalDate:"2026-11-13",shifts:[]}),{status:200,headers:{"content-type":"application/json"}})); });
    const view = render(<AuthProvider><OperationsWorkspace session={session} onSettings={()=>undefined}/></AuthProvider>);
    fireEvent.click(await screen.findByRole("button",{name:"Collapse left menu"}));
    expect(screen.getByRole("button",{name:"Show left menu"})).toBeInTheDocument();
    expect(localStorage.getItem("nighty:sidebar-collapsed")).toBe("true");
    view.unmount();
    render(<AuthProvider><OperationsWorkspace session={session} onSettings={()=>undefined}/></AuthProvider>);
    expect(await screen.findByRole("button",{name:"Show left menu"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Show left menu"}));
    await waitFor(()=>expect(screen.getByLabelText("Operational day calendar")).toBeInTheDocument());
    expect(localStorage.getItem("nighty:sidebar-collapsed")).toBe("false");
  });

  it("treats the mobile left menu as a modal drawer and restores focus after Escape", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const session = { userId: "u1", displayName: "Aisha", role: "ADMIN" as const, csrfToken: "csrf", expiresAt: "2026-11-13T20:00:00Z" };
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => { const url=String(request); if(url.includes("/auth/me")) return Promise.resolve(new Response(JSON.stringify(session),{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/tags") || url.includes("/team") || url.includes("/shifts")) return Promise.resolve(new Response("[]",{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/profile")) return Promise.resolve(new Response(JSON.stringify({id:"u1",username:"aisha",displayName:"Aisha",role:"ADMIN",shiftIds:[]}),{status:200,headers:{"content-type":"application/json"}})); if(url.includes("/operational-days/current")) return Promise.resolve(new Response(JSON.stringify({operationalDate:"2026-11-13"}),{status:200,headers:{"content-type":"application/json"}})); return Promise.resolve(new Response(JSON.stringify({operationalDayId:"day",operationalDate:"2026-11-13",shifts:[]}),{status:200,headers:{"content-type":"application/json"}})); });
    render(<AuthProvider><OperationsWorkspace session={session} onSettings={()=>undefined}/></AuthProvider>);
    const opener = await screen.findByRole("button", { name: "Show left menu" });
    expect(opener).toHaveAttribute("aria-controls", "operations-sidebar");
    expect(opener).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(opener);
    const drawer = await screen.findByRole("dialog", { name: "Left menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Close left menu" })).toHaveFocus());
    expect(document.querySelector(".operations-stage")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Show left menu" })).toHaveFocus());
    expect(document.querySelector(".operations-stage")).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Show left menu" }));
    const searchDrawer = await screen.findByRole("dialog", { name: "Left menu" });
    fireEvent.click(within(searchDrawer).getByRole("button", { name: /^Search/ }));
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Left menu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));

    fireEvent.click(screen.getByRole("button", { name: "Show left menu" }));
    const profileDrawer = await screen.findByRole("dialog", { name: "Left menu" });
    fireEvent.click(within(profileDrawer).getByRole("button", { name: /AishaAdministrator/ }));
    expect(await screen.findByRole("dialog", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Left menu" })).not.toBeInTheDocument();
  });
});
