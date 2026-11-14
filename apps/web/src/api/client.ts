export type Role = "ADMIN" | "OPERATOR";
export interface Session { userId: string; displayName: string; role: Role; csrfToken: string; expiresAt: string; }
let csrfToken = "";
export function setCsrfToken(value?: string) { csrfToken = value ?? ""; }
function messageFrom(body: unknown, fallback: string) { if (body && typeof body === "object" && "message" in body) { const value = (body as { message: unknown }).message; if (Array.isArray(value)) return value.join(". "); if (typeof value === "string") return value; } return fallback; }
export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  if (csrfToken && init.method && init.method !== "GET" && init.method !== "HEAD") headers.set("x-csrf-token", csrfToken);
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) { let body: unknown; try { body = await response.json(); } catch { body = undefined; } if (response.status === 401) window.dispatchEvent(new Event("nighty:unauthorized")); throw new ApiError(response.status, messageFrom(body, response.status === 401 ? "Your session has expired" : "Request failed")); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export function jsonBody(value: unknown): Pick<RequestInit, "body"> { return { body: JSON.stringify(value) }; }
