import { useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import { Offers } from "./pages/Offers";
import { Login } from "./pages/Login";
import { Plan } from "./pages/Plan";
import { SettingsPage } from "./pages/SettingsPage";

type Tab = "plan" | "offers" | "settings";
const TABS: [Tab, string][] = [["plan", "Einkauf planen"], ["offers", "Angebote"], ["settings", "Einstellungen"]];

export default function App() {
  const [user, setUser] = useState(() => session.get());
  const [tab, setTab] = useState<Tab>("plan");

  useEffect(() => {
    setUnauthorizedHandler(() => { session.clear(); setUser(null); });
  }, []);

  if (!user) return <Login onDone={() => setUser(session.get())} />;

  async function logout() {
    try { await api.logout(); } catch { /* Session ist evtl. schon weg */ }
    session.clear();
    setUser(null);
  }

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="font-display text-2xl">Smart Grocery</div>
          <nav aria-label="Hauptnavigation" className="flex gap-1">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-mark text-ink" : "hover:bg-white/10"}`}>{l}</button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user.username && <span className="text-paper/70">{user.username}</span>}
            <button onClick={logout} className="underline underline-offset-2 hover:text-mark">Abmelden</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {tab === "plan" && <Plan />}
        {tab === "offers" && <Offers />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
