import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntryView } from "../operations/EntryView";

describe("approved editor actions", () => {
  it("renders a standalone interactive To-do list with no Decision, Issue, or Checklist action", () => {
    render(<EntryView writable entry={{ id: "e1", type: "TODO", editorDocument: {}, plainText: "First\nSecond", todoItems: [{ id: "t1", text: "First", position: 1 }, { id: "t2", text: "Second", position: 2 }], authorId: "u1", author: { id: "u1", displayName: "Aisha" }, createdAt: "2026-11-13T15:00:00Z" }} onChange={() => undefined} />);
    expect(screen.getByText("To-do list")).toBeInTheDocument(); expect(screen.getAllByRole("checkbox")).toHaveLength(2); expect(screen.queryByText("Decision")).not.toBeInTheDocument(); expect(screen.queryByText("Issue")).not.toBeInTheDocument(); expect(screen.queryByText("Checklist")).not.toBeInTheDocument();
  });
});
