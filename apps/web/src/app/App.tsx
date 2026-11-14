import { Gear, SignOut, UserCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { LoginPage } from "../auth/LoginPage";
import { ProfilePanel } from "../profile/ProfilePanel";
import "../styles/global.css";

function SignedInApp() {
  const { session, status, logout } = useAuth(); const [profileOpen, setProfileOpen] = useState(false);
  if (status === "loading") return <main className="loading-screen" aria-live="polite">Opening Nighty…</main>;
  if (status === "guest" || !session) return <LoginPage />;
  return <div className="workspace-shell"><aside className="operations-sidebar"><header className="wordmark"><strong>Nighty</strong><span>Shift Operations Handover</span></header><nav aria-label="Primary navigation"><button className="nav-item active">Operations</button>{session.role === "ADMIN" && <button className="nav-item"><Gear /> Settings</button>}</nav><div className="sidebar-account"><button onClick={() => setProfileOpen(true)}><UserCircle size={24} /><span><strong>{session.displayName}</strong><small>{session.role === "ADMIN" ? "Administrator" : "Operator"}</small></span></button><button className="icon-button" onClick={() => void logout()} aria-label="Sign out"><SignOut /></button></div></aside><main className="workspace-main"><div className="empty-workspace"><div className="eyebrow">Current operational day</div><h1>Shift canvas</h1><p>Your assigned shift workspace is ready to load.</p></div></main>{profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}</div>;
}

export function App() { return <AuthProvider><SignedInApp /></AuthProvider>; }
