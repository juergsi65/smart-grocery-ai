import { ListChecks, Receipt, Settings, Tag } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { api, session, setUnauthorizedHandler } from "./api";
import { cn } from "./lib/utils";
import { Login } from "./pages/Login";
import { Offers } from "./pages/Offers";
import { Plan } from "./pages/Plan";
import { SettingsPage } from "./pages/SettingsPage";
import { ShoppingList } from "./pages/ShoppingList";
import { useTheme } from "./lib/theme";

type Tab = "offers" | "list" | "plan" | "settings";
const TABS: [Tab, string, ComponentType<{ className?: string }>][] = [
  ["offers", "Angebote", Tag], ["list", "Liste", ListChecks], ["plan", "Planer", Receipt], ["settings", "Mehr", Settings],
];

export default function App() {
  useTheme(); // wendet gespeicherte/Systemwahl (Light/Dark) sofort an
  const [user, setUser] = useState(() => session.get());
  const [tab, setTab] = useState<Tab>("offers");
  const [autoRun, setAutoRun] = useState(0); // zaehlt Starts "Liste vergleichen" hoch

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
      <header className="glass sticky top-0 z-30 border-b border-border/60" style={{ height: "var(--header-h)" }}>
        <div className="mx-auto flex h-full max-w-6xl items-center gap-6 px-4">
          <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">🛒</span>
            Smart Grocery
          </div>
          <nav aria-label="Hauptnavigation" className="hidden gap-1 rounded-full bg-muted p-1 md:flex">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
                className={cn("h-10 rounded-full px-5 text-sm font-semibold transition-colors", tab === k ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {l === "Mehr" ? "Einstellungen" : l}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user.username && <span className="hidden max-w-44 truncate text-muted-foreground sm:inline">{user.username}</span>}
            <button onClick={logout} className="min-h-11 rounded-full px-3 font-semibold text-primary hover:bg-secondary">Abmelden</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        {tab === "offers" && <Offers goSettings={() => setTab("settings")} />}
        {tab === "list" && <ShoppingList onOptimize={() => { setAutoRun((n) => n + 1); setTab("plan"); }} />}
        {tab === "plan" && <Plan key={autoRun} initialSource={autoRun ? "list" : undefined} autoStart={autoRun > 0} />}
        {tab === "settings" && <SettingsPage />}
      </main>

      <nav aria-label="Hauptnavigation" className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border/60 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold transition-colors", tab === k ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("grid h-8 w-16 place-items-center rounded-full transition-all", tab === k && "bg-secondary")}>
                <Icon className="size-6" />
              </span>
              {l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
