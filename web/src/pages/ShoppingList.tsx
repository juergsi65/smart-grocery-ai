import { ChevronDown, Home, Plus, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, Notice, inputCls } from "../components/ui";
import { CATEGORIES, categoryOf } from "../lib/categories";
import { cn } from "../lib/utils";
import { Price } from "../components/Price";
import { RetailerLogo } from "../components/Media";
import type { OfferTip, ShoppingItem } from "../types";

const isDone = (i: ShoppingItem) => i.is_bought || i.in_pantry;
const order = (id: string) => CATEGORIES.findIndex((c) => c.id === id);

export function ShoppingList({ onOptimize }: { onOptimize: () => void }) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [tips, setTips] = useState<Record<string, OfferTip>>({});
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "add" | "import">(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(() => api.list().then((r) => { setItems(r.items); setTips(r.tips ?? {}); }).catch((e: Error) => setMsg({ tone: "error", text: e.message })), []);
  useEffect(() => { load(); return () => timers.current.forEach(clearTimeout); }, [load]);

  const open = useMemo(() => (items ?? []).filter((i) => !isDone(i)).sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name)), [items]);
  const done = useMemo(() => (items ?? []).filter(isDone).sort((a, b) => b.updated_at - a.updated_at), [items]);
  const groups = useMemo(() => {
    const out: { id: string; items: ShoppingItem[] }[] = [];
    for (const it of open) {
      const g = out[out.length - 1];
      if (g && g.id === it.category) g.items.push(it); else out.push({ id: it.category, items: [it] });
    }
    return out;
  }, [open]);

  /** Optimistisch aendern, bei Fehler zuruecksetzen. */
  async function setFlags(it: ShoppingItem, patch: { is_bought?: boolean; in_pantry?: boolean }) {
    const prev = items;
    setItems((cur) => cur && cur.map((x) => (x.id === it.id ? { ...x, ...patch, updated_at: Date.now() } : x)));
    setFresh((s) => new Set(s).add(it.id));
    try { await api.patchListItem(it.id, patch); }
    catch (e) { setItems(prev); setMsg({ tone: "error", text: `Status konnte nicht gespeichert werden: ${(e as Error).message}` }); }
  }

  /** Erst Strike-through (Rueckmeldung), dann Slide-Down in den Erledigt-Bereich. */
  function complete(it: ShoppingItem, patch: { is_bought?: boolean; in_pantry?: boolean }) {
    setLeaving((s) => new Set(s).add(it.id));
    timers.current.push(window.setTimeout(() => {
      setLeaving((s) => { const n = new Set(s); n.delete(it.id); return n; });
      setFlags(it, patch);
      setPanelOpen(true);
    }, 380));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setBusy("add");
    try { setItems((await api.addListItem(name)).items); setDraft(""); setMsg(null); }
    catch (err) { setMsg({ tone: "error", text: (err as Error).message }); }
    finally { setBusy(null); }
  }

  async function importCookidoo() {
    setBusy("import");
    setMsg(null);
    try {
      const r = await api.importList({ source: "cookidoo-list" });
      setItems(r.items);
      setMsg({ tone: "info", text: `${r.imported ?? 0} Zutaten aus Cookidoo übernommen. Abgehakte stehen unter „Erledigt“.` });
    } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); }
    finally { setBusy(null); }
  }

  async function remove(it: ShoppingItem) {
    const prev = items;
    setItems((cur) => cur && cur.filter((x) => x.id !== it.id));
    try { await api.deleteListItem(it.id); } catch (e) { setItems(prev); setMsg({ tone: "error", text: (e as Error).message }); }
  }

  const total = (items?.length ?? 0);
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  return (
    <div className="pb-24 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl">Einkaufsliste</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {items ? `${open.length} offen · ${done.length} erledigt` : " "}
          </p>
        </div>
        <Button variant="outline" onClick={importCookidoo} disabled={busy !== null}>
          <RefreshCw className={cn(busy === "import" && "animate-spin")} />
          {busy === "import" ? "Synchronisiere …" : "Aus Cookidoo laden"}
        </Button>
      </div>

      {total > 0 && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <form onSubmit={add} className="mt-5 flex gap-2">
        <input aria-label="Zutat hinzufügen" className={cn(inputCls, "rounded-full")} placeholder="Zutat hinzufügen, z. B. 500 g Mehl" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} />
        <Button type="submit" size="icon" disabled={busy !== null || !draft.trim()} aria-label="Hinzufügen"><Plus /></Button>
      </form>

      {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {items && items.length === 0 && (
        <Card className="mt-8 px-6 py-12 text-center">
          <div className="text-5xl" aria-hidden="true">🧺</div>
          <h2 className="mt-3 text-xl">Deine Liste ist leer</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Lade deine Cookidoo-Einkaufsliste oder füge oben Zutaten hinzu.</p>
        </Card>
      )}

      {open.length > 0 && <h2 className="mt-8 text-xl">Noch zu kaufen <span className="text-muted-foreground">({open.length})</span></h2>}
      <div className="mt-3 space-y-5">
        {groups.map((g) => {
          const c = categoryOf(g.id);
          return (
            <section key={g.id} aria-label={c.name}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span aria-hidden="true" className="text-base">{c.icon}</span>{c.name}
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {g.items.map((it) => (
                  <Row key={it.id} it={it} tip={tips[it.id]} leaving={leaving.has(it.id)}
                    onCheck={() => complete(it, { is_bought: true })}
                    onPantry={() => complete(it, { in_pantry: true })} />
                ))}
              </Card>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <Collapsible open={panelOpen} onOpenChange={setPanelOpen} className="mt-6">
          <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-muted px-4 text-left text-sm font-semibold">
            <span className="flex-1">Bereits vorhanden / Abgehakt</span>
            <Badge>{done.length}</Badge>
            <ChevronDown className={cn("size-5 transition-transform", panelOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 divide-y divide-border overflow-hidden">
              {done.map((it) => (
                <div key={it.id} className={cn("flex min-h-14 items-center gap-1 pr-2", fresh.has(it.id) && "animate-slide-down")}>
                  <Checkbox checked aria-label={`${it.name} wieder öffnen`} onCheckedChange={() => setFlags(it, { is_bought: false, in_pantry: false })} />
                  <div className="min-w-0 flex-1 py-2">
                    <div className="truncate text-muted-foreground line-through decoration-muted-foreground/60">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.in_pantry ? "Zu Hause vorhanden" : "Gekauft"}{it.display && it.display !== it.name ? ` · ${it.display}` : ""}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Wieder öffnen" onClick={() => setFlags(it, { is_bought: false, in_pantry: false })}><Undo2 /></Button>
                  <Button variant="ghost" size="icon" aria-label={`${it.name} löschen`} onClick={() => remove(it)}><Trash2 /></Button>
                </div>
              ))}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {open.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex justify-end px-4 md:static md:mt-8 md:justify-start md:px-0">
          <Button size="fab" onClick={onOptimize}><Sparkles /> Angebote vergleichen</Button>
        </div>
      )}
    </div>
  );
}

function Row({ it, tip, leaving, onCheck, onPantry }: { it: ShoppingItem; tip?: OfferTip; leaving: boolean; onCheck: () => void; onPantry: () => void }) {
  return (
    <div className={cn("flex min-h-14 items-center gap-1 pr-2 transition-all duration-300", leaving && "translate-x-2 opacity-40")}>
      <Checkbox checked={leaving} aria-label={`${it.name} abhaken`} onCheckedChange={onCheck} />
      <div className="min-w-0 flex-1 py-2">
        <div className={cn("font-medium leading-snug transition-all", leaving && "text-muted-foreground line-through")}>{it.name}</div>
        {it.display && it.display !== it.name && <div className="text-xs text-muted-foreground">{it.display}</div>}
        {tip && !leaving && (
          <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary py-0.5 pr-2.5 pl-0.5 text-xs text-secondary-foreground">
            <RetailerLogo src={tip.retailer_logo} name={tip.retailer} size={20} />
            <span className="truncate font-semibold">{tip.retailer}</span>
            <span className="inline-flex items-center gap-0.5"><Price cents={tip.price_cents} size="sm" /> €</span>
            {tip.discount_pct ? <span className="font-bold text-discount">−{tip.discount_pct} %</span> : null}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label={`${it.name} ist zu Hause vorhanden`} title="Habe ich zu Hause" onClick={onPantry}><Home /></Button>
    </div>
  );
}
