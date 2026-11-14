import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";

const reply = (status: number, body?: unknown) => Promise.resolve(new Response(body === undefined ? undefined : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.restoreAllMocks());

describe("authentication", () => {
  it("shows password, reports invalid credentials, and restores an administrator", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => reply(401)).mockImplementationOnce(() => reply(401, { message: "Invalid username or password" })).mockImplementationOnce(() => reply(201, { userId: "u1", displayName: "Aisha", role: "ADMIN", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    render(<App />); await screen.findByRole("heading", { name: "Welcome back" }); fireEvent.click(screen.getByRole("button", { name: "Show password" })); expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text"); fireEvent.change(screen.getByLabelText("Username"), { target: { value: "aisha" } }); fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" })); expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password"); fireEvent.change(screen.getByLabelText("Password"), { target: { value: "NightyDemo!2026" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" })); expect(await screen.findByRole("button", { name: /Settings/ })).toBeInTheDocument();
  });
  it("returns to login when the secure session expires", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => reply(200, { userId: "u1", displayName: "Aisha", role: "ADMIN", csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString() })); render(<App />); await screen.findByText("Aisha"); window.dispatchEvent(new Event("nighty:unauthorized")); await waitFor(() => expect(screen.getByText(/expired after 30 minutes/)).toBeInTheDocument());
  });
});
