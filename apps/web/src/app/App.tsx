import { MoonStars } from "@phosphor-icons/react";
import "../styles/global.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="brand-card" aria-labelledby="nighty-title">
        <div className="brand-mark" aria-hidden="true">
          <MoonStars size={32} weight="duotone" />
        </div>
        <div>
          <h1 id="nighty-title">Nighty</h1>
          <p>Shift Operations Handover</p>
        </div>
      </section>
    </main>
  );
}
