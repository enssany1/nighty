import { useState } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { LoginPage } from "../auth/LoginPage";
import { OperationsWorkspace } from "../operations/OperationsWorkspace";
import { SettingsWorkspace } from "../settings/SettingsWorkspace";
import "../styles/global.css";

function SignedInApp() {
  const { session, status } = useAuth(); const [view, setView] = useState<"operations" | "settings">("operations");
  if (status === "loading") return <main className="loading-screen" aria-live="polite">Opening Nighty…</main>;
  if (status === "guest" || !session) return <LoginPage />;
  if (view === "settings" && session.role === "ADMIN") return <SettingsWorkspace onBack={() => setView("operations")} />;
  return <OperationsWorkspace session={session} onSettings={() => setView("settings")} />;
}

export function App() { return <AuthProvider><SignedInApp /></AuthProvider>; }
