import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, jsonBody, setCsrfToken, type Session } from "../api/client";
interface AuthValue { session: Session | null; status: "loading" | "guest" | "authenticated"; notice: string; login(username: string, password: string): Promise<void>; logout(): Promise<void>; updateDisplayName(displayName: string): void; }
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [status, setStatus] = useState<AuthValue["status"]>("loading"); const [notice, setNotice] = useState("");
  const accept = useCallback((next: Session) => { setSession(next); setCsrfToken(next.csrfToken); setStatus("authenticated"); setNotice(""); }, []);
  useEffect(() => { let mounted = true; api<Session>("/auth/me").then((value) => mounted && accept(value)).catch(() => { if (mounted) setStatus("guest"); }); const expired = () => { setSession(null); setCsrfToken(); setStatus("guest"); setNotice("Your secure session expired after 30 minutes of inactivity. Sign in to continue."); }; window.addEventListener("nighty:unauthorized", expired); return () => { mounted = false; window.removeEventListener("nighty:unauthorized", expired); }; }, [accept]);
  const value = useMemo<AuthValue>(() => ({ session, status, notice, async login(username, password) { accept(await api<Session>("/auth/login", { method: "POST", ...jsonBody({ username, password }) })); }, async logout() { try { await api<void>("/auth/logout", { method: "POST" }); } finally { setSession(null); setCsrfToken(); setStatus("guest"); } }, updateDisplayName(displayName) { setSession((current) => current ? { ...current, displayName } : current); } }), [accept, notice, session, status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }
