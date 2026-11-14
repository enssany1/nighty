import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Nighty application shell", () => {
  it("identifies the approved product", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Nighty" })).toBeInTheDocument();
    expect(screen.getByText("Shift Operations Handover")).toBeInTheDocument();
  });
});
