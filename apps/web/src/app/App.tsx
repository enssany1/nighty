import { useState } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { LoginPage } from "../auth/LoginPage";
import { OperationsWorkspace } from "../operations/OperationsWorkspace";
import "../styles/global.css";

function SignedInApp() {
  const { session, status } = useAuth(); const [view, setView] = useState<"operations" | "settings">("operations");
  if (status === "loading") return <main className="loading-screen" aria-live="polite">Opening Nighty…</main>;
  if (status === "guest" || !session) return <LoginPage />;
  if (view === "settings" && session.role === "ADMIN") return <main className="workspace-main"><button onClick={() => setView("operations")}>Back to operations</button><div className="empty-workspace"><div className="eyebrow">Administration</div><h1>Settings</h1><p>Administration workspace is loading next.</p></div></main>;
  return <OperationsWorkspace session={session} onSettings={() => setView("settings")} />;
}

export function App() { return <AuthProvider><SignedInApp /></AuthProvider>; }
