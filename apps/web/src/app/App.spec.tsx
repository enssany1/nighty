import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function response(status: number, body?: unknown) { return Promise.resolve(new Response(body === undefined ? undefined : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })); }
afterEach(() => vi.restoreAllMocks());

describe("Nighty access experience", () => {
  it("supports invalid login, password visibility, and administrator navigation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => response(401, { message: "Unauthorized" })).mockImplementationOnce(() => response(401, { message: "Invalid username or password" })).mockImplementationOnce(() => response(201, { userId: "u1", displayName: "Aisha Rahman", role: "ADMIN", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back" });
    fireEvent.click(screen.getByRole("button", { name: "Show password" })); expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "aisha" } }); fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "NightyDemo!2026" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: /Settings/ })).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("does not show Settings to an operator and opens profile facts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => response(200, { userId: "u2", displayName: "Marcus", role: "OPERATOR", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() })).mockImplementationOnce(() => response(200, { id: "u2", username: "marcus", displayName: "Marcus", role: "OPERATOR", shiftIds: [] }));
    render(<App />); expect(await screen.findByText("Marcus")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Settings/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Marcus/ })); expect(await screen.findByDisplayValue("marcus")).toBeInTheDocument(); expect(screen.getByDisplayValue("Operator")).toBeInTheDocument();
  });
  it("returns to login when the session-expired event is raised", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => response(200, { userId: "u1", displayName: "Aisha", role: "ADMIN", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    render(<App />); await screen.findByText("Aisha"); window.dispatchEvent(new Event("nighty:unauthorized")); await waitFor(() => expect(screen.getByText(/expired after 30 minutes/)).toBeInTheDocument());
  });
});
