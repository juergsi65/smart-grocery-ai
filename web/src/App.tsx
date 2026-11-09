import { useEffect, useState } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import { Login } from "./pages/Login";
import { Offers } from "./pages/Offers";
import { Plan } from "./pages/Plan";
import { SettingsPage } from "./pages/SettingsPage";

type Tab = "offers" | "plan" | "settings";
const TABS: [Tab, string, string][] = [["offers", "Angebote", "🏷️"], ["plan", "Planer", "🧾"], ["settings", "Einstellungen", "⚙️"]];

export default function App() {
  const [user, setUser] = useState(() => session.get());
  const [tab, setTab] = useState<Tab>("offers");

  useEffect(() => { setUnauthorizedHandler(() => { session.clear(); setUser(null); }); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (!user) return <Login onDone={() => setUser(session.get())} />;

  async function logout() {
    try { await api.logout(); } catch { /* Session ist evtl. schon weg */ }
    session.clear();
    setUser(null);
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="bg-ink text-paper sticky top-0 z-20" style={{ height: "var(--header-h)" }}>
        <div className="mx-auto max-w-6xl px-4 h-full flex items-center gap-6">
          <div className="font-display text-2xl">Smart Grocery</div>
          <nav aria-label="Hauptnavigation" className="hidden md:flex gap-1">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
                className={`rounded-full px-4 h-9 text-sm font-semibold ${tab === k ? "bg-mark text-ink" : "hover:bg-white/10"}`}>{l}</button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user.username && <span className="text-paper/70 hidden sm:inline truncate max-w-40">{user.username}</span>}
            <button onClick={logout} className="underline underline-offset-2 hover:text-mark">Abmelden</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        {tab === "offers" && <Offers goSettings={() => setTab("settings")} />}
        {tab === "plan" && <Plan />}
        {tab === "settings" && <SettingsPage />}
      </main>

      <nav aria-label="Hauptnavigation" className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([k, l, icon]) => (
          <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${tab === k ? "text-tag-dark" : "text-ink-soft"}`}>
            <span className={`text-xl rounded-full px-4 ${tab === k ? "bg-mark" : ""}`} aria-hidden="true">{icon}</span>{l}
          </button>
        ))}
      </nav>
    </div>
  );
}
