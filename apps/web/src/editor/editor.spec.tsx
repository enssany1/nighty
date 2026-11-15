import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryView } from "../operations/EntryView";
import { EntryComposer } from "./EntryComposer";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("approved editor actions", () => {
  it("renders a standalone interactive To-do list with no Decision, Issue, or Checklist action", () => {
    render(<EntryView writable entry={{ id: "e1", type: "TODO", editorDocument: {}, plainText: "First\nSecond", todoItems: [{ id: "t1", text: "First", position: 1 }, { id: "t2", text: "Second", position: 2 }], authorId: "u1", author: { id: "u1", displayName: "Aisha" }, createdAt: "2026-11-13T15:00:00Z" }} onChange={() => undefined} />);
    expect(screen.getByText("To-do list")).toBeInTheDocument(); expect(screen.getAllByRole("checkbox")).toHaveLength(2); expect(screen.queryByText("Decision")).not.toBeInTheDocument(); expect(screen.queryByText("Issue")).not.toBeInTheDocument(); expect(screen.queryByText("Checklist")).not.toBeInTheDocument();
  });

  it("adds a row with Enter and exits only after two consecutive empty Enters", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: [""] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    const first = screen.getByPlaceholderText("Add a to-do and press Enter");
    fireEvent.change(first, { target: { value: "Call manager" } });
    fireEvent.keyDown(first, { key: "Enter" });
    const second = await screen.findByPlaceholderText("Another to-do");
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByPlaceholderText("Another to-do")).toBeInTheDocument();
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.queryByPlaceholderText("Another to-do")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Call manager")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus());
  });

  it("keeps the initial empty row available and exits it only on the second Enter", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: [""] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    const first = screen.getByPlaceholderText("Add a to-do and press Enter");
    fireEvent.keyDown(first, { key: "Enter" });
    expect(first).toBeInTheDocument();
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.getByPlaceholderText("Add a to-do and press Enter")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus());
  });

  it("removes individual rows or the whole To-do block", () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["First", "Second"] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove to-do 1" }));
    expect(screen.queryByDisplayValue("First")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove to-do list" }));
    expect(screen.queryByText("To-do list")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Write an update")).toBeInTheDocument();
  });

  it("preserves row identity when inserting and removing a middle row", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["First", "Third"] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    const first = screen.getByDisplayValue("First");
    const third = screen.getByDisplayValue("Third");
    fireEvent.keyDown(first, { key: "Enter" });
    const middle = await screen.findByLabelText("To-do text 2");
    fireEvent.change(middle, { target: { value: "Second" } });
    expect(screen.getByDisplayValue("Third")).toBe(third);
    fireEvent.click(screen.getByRole("button", { name: "Remove to-do 2" }));
    expect(screen.getByDisplayValue("Third")).toBe(third);
  });

  it("derives plainText from populated To-do rows and ignores blank rows", async () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["Call manager", "  "] }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "entry", type: "TODO", todoItems: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ plainText: "Call manager", todoItems: [{ text: "Call manager", position: 1 }] });
    expect(screen.queryByText(/plainText must be/)).not.toBeInTheDocument();
  });

  it("shows a friendly validation message for an empty To-do list", () => {
    localStorage.setItem("nighty:draft:2026-11-13:shift", JSON.stringify({ type: "TODO", todos: ["  "] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(<EntryComposer shiftId="shift" operationalDate="2026-11-13" onSubmitted={() => undefined} onHandover={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("status")).toHaveTextContent("Add at least one to-do item.");
  });
});
