import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryView } from "../operations/EntryView";
import { EntryComposer } from "./EntryComposer";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** Answers /team with an empty list and records every entry save. */
function mockSaves() {
  const saves: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((request, init) => {
    const url = String(request);
    if (url.includes("/team")) return Promise.resolve(json([]));
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    saves.push({ url, method: String(init?.method), body });
    return Promise.resolve(json({ id: "entry-1", type: body.type, plainText: body.plainText, todoItems: [] }, init?.method === "POST" ? 201 : 200));
  });
  return saves;
}
const slow = { timeout: 4000 };

describe("approved editor actions", () => {
  it("does not repeat the selected action in the composer footer", () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "UPDATE", todos: [""] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    const { container } = render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => undefined} />);
    expect(container.querySelector(".composer-tools .action-badge")).not.toBeInTheDocument();
  });

  it("has no Submit button and saves automatically instead", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json([]));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saves automatically as you type");
    expect(screen.getByRole("button", { name: /Handover/ })).toBeInTheDocument();
  });

  it("renders a standalone interactive To-do list with no Decision, Issue, or Checklist action", () => {
    render(<EntryView writable entry={{ id: "e1", type: "TODO", editorDocument: {}, plainText: "First\nSecond", todoItems: [{ id: "t1", text: "First", position: 1 }, { id: "t2", text: "Second", position: 2 }], authorId: "u1", author: { id: "u1", displayName: "Aisha" }, createdAt: "2026-11-13T15:00:00Z" }} onChange={() => undefined} />);
    expect(screen.getByText("To-do list")).toBeInTheDocument(); expect(screen.getAllByRole("checkbox")).toHaveLength(2); expect(screen.queryByText("Decision")).not.toBeInTheDocument(); expect(screen.queryByText("Issue")).not.toBeInTheDocument(); expect(screen.queryByText("Checklist")).not.toBeInTheDocument();
  });

  it("adds a row with Enter, saves the list on its own and starts a new entry after two empty Enters", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: [""] }));
    const saves = mockSaves(); const onSaved = vi.fn();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={onSaved} onHandover={() => undefined} />);
    const first = screen.getByPlaceholderText("Add a to-do and press Enter");
    fireEvent.change(first, { target: { value: "Call manager" } });
    fireEvent.keyDown(first, { key: "Enter" });
    const second = await screen.findByPlaceholderText("Another to-do");
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByPlaceholderText("Another to-do")).toBeInTheDocument();
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    await waitFor(() => expect(onSaved).toHaveBeenLastCalledWith(null), slow);
    expect(saves[0]).toMatchObject({ method: "POST", body: { type: "TODO", plainText: "Call manager", todoItems: [{ text: "Call manager", position: 1 }] } });
    expect(saves[0]!.url).toContain("/shift-instances/shift/entries");
    expect(onSaved).toHaveBeenCalledWith("entry-1");
    expect(screen.queryByDisplayValue("Call manager")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Write an update")).toBeInTheDocument();
    expect(localStorage.getItem("nighty:draft:2026-11-13:shift")).toBeNull();
  });

  it("keeps the initial empty row and saves nothing when Enter is pressed on it twice", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: [""] }));
    const saves = mockSaves();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => undefined} />);
    const first = screen.getByPlaceholderText("Add a to-do and press Enter");
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.getByPlaceholderText("Add a to-do and press Enter")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(saves).toHaveLength(0);
  });

  it("removes individual rows or closes the whole To-do block", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["First", "Second"], entryId: "entry-1" }));
    const saves = mockSaves();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove to-do 1" }));
    expect(screen.queryByDisplayValue("First")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close to-do list" }));
    await waitFor(() => expect(screen.queryByText("To-do list")).not.toBeInTheDocument(), slow);
    expect(screen.getByLabelText("Write an update")).toBeInTheDocument();
    expect(saves[saves.length - 1]).toMatchObject({ method: "PATCH", body: { autosave: true, todoItems: [{ text: "Second", position: 1 }] } });
    expect(saves[saves.length - 1]!.url).toContain("/entries/entry-1");
  });

  it("preserves row identity when inserting and removing a middle row", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["First", "Third"] }));
    mockSaves();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => undefined} />);
    const first = screen.getByDisplayValue("First");
    const third = screen.getByDisplayValue("Third");
    fireEvent.keyDown(first, { key: "Enter" });
    const middle = await screen.findByLabelText("To-do text 2");
    fireEvent.change(middle, { target: { value: "Second" } });
    expect(screen.getByDisplayValue("Third")).toBe(third);
    fireEvent.click(screen.getByRole("button", { name: "Remove to-do 2" }));
    expect(screen.getByDisplayValue("Third")).toBe(third);
  });

  it("creates the entry once, then keeps saving later typing into the same entry", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["Call manager", "  "] }));
    const saves = mockSaves(); const onSaved = vi.fn();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={onSaved} onHandover={() => undefined} />);
    await waitFor(() => expect(saves).toHaveLength(1), slow);
    expect(saves[0]).toMatchObject({ method: "POST", body: { plainText: "Call manager", todoItems: [{ text: "Call manager", position: 1 }] } });
    expect(saves[0]!.body.autosave).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"), slow);
    fireEvent.change(screen.getByDisplayValue("Call manager"), { target: { value: "Call the duty manager" } });
    await waitFor(() => expect(saves).toHaveLength(2), slow);
    expect(saves[1]).toMatchObject({ method: "PATCH", body: { autosave: true, plainText: "Call the duty manager" } });
    expect(saves[1]!.url).toContain("/entries/entry-1");
    expect(onSaved).toHaveBeenCalledWith("entry-1");
    expect(JSON.parse(localStorage.getItem("nighty:draft:2026-11-13:shift")!)).toMatchObject({ entryId: "entry-1" });
  });

  it("autosaves a restored Update or Follow draft without any button press", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "FOLLOW", html: "<p>Watch the API error rate</p><p></p>", todos: [""] }));
    const saves = mockSaves(); const onSaved = vi.fn();
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={onSaved} onHandover={() => undefined} />);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("entry-1"), slow);
    expect(saves[0]).toMatchObject({ method: "POST", body: { type: "FOLLOW", plainText: "Watch the API error rate" } });
    expect((saves[0]!.body.editorDocument as { content: unknown[] }).content).toHaveLength(1);
  });

  it("saves whatever is pending before Handover and keeps the text when a save fails", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["Check backups"] }));
    const order: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((request, init) => { const url = String(request); if (url.includes("/team")) return Promise.resolve(json([])); order.push(String(init?.method)); return Promise.resolve(json({ message: "This shift is read-only" }, 403)); });
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSaved={() => undefined} onHandover={() => order.push("handover")} />);
    fireEvent.click(screen.getByRole("button", { name: /Handover/ }));
    await waitFor(() => expect(order).toEqual(["POST", "handover"]), slow);
    expect(screen.getByRole("status")).toHaveTextContent("This shift is closed");
    expect(screen.getByDisplayValue("Check backups")).toBeInTheDocument();
  });
});
