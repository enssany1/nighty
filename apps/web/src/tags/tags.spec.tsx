import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagWhiteboard } from "./TagWhiteboard";

afterEach(() => vi.restoreAllMocks());
describe("Tag whiteboard", () => {
  it("is a separate writable whiteboard with an editable administrator Tag name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } })); render(<TagWhiteboard tag={{ id: "tag", name: "handover", position: 1 }} role="ADMIN" onRenamed={() => undefined} />); expect(screen.getByRole("textbox", { name: "Post to handover" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Edit Tag name" })).toBeInTheDocument(); expect(await screen.findByText("This whiteboard is empty")).toBeInTheDocument();
  });
});
