import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.restoreAllMocks());
describe("Nighty application", () => {
  it("identifies the approved product at the secure access boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } })); render(<App />); expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument(); expect(screen.getByText("Shift Operations Handover")).toBeInTheDocument();
  });
});
