import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { MarketPicker } from "../components/MarketPicker";
import { PlanView } from "../components/PlanView";
import { useMarkets } from "../lib/markets";
import { Button, Notice, Spinner, inputCls } from "../components/ui";
import type { Aggregated, OptimizeResponse, WeekDay } from "../types";

type Source = "recipes" | "list" | "manual";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const fmt = (iso: string) => new Date(iso).toLocaleDateString("de-AT", { day: "numeric", month: "long" });

function AggregatedList({ items }: { items: Aggregated[] }) {
  return (
    <ul className="columns-1 sm:columns-2 gap-8 text-sm">
      {items.map((i) => (
        <li key={i.name} className="break-inside-avoid py-1.5 border-b border-border">
          {i.display}
          {i.sourceRecipeNames.length > 1 && (
            <span className="text-muted-foreground"> · in {i.sourceRecipeNames.length} Rezepten</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Plan({ initialSource, autoStart }: { initialSource?: Source; autoStart?: boolean } = {}) {
  const { markets, toggle: toggleMarket, set: setMarkets } = useMarkets();
  const [source, setSource] = useState<Source>(initialSource ?? "recipes");
  const [anchor, setAnchor] = useState(() => new Date());
  const [week, setWeek] = useState<WeekDay[] | null>(null);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [merged, setMerged] = useState<Aggregated[] | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [busy, setBusy] = useState<null | "merge" | "optimize" | "sync" | "list">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { if (autoStart) void optimize(); /* einmalig beim Oeffnen aus der Liste */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source !== "recipes") return;
    let cancelled = false;
    setWeek(null);
    setWeekErr(null);
    api.week(isoDate(anchor)).then((w) => !cancelled && setWeek(w)).catch((e: Error) => !cancelled && setWeekErr(e.message));
    return () => { cancelled = true; };
  }, [source, anchor]);

  const allRecipeIds = useMemo(() => [...new Set((week ?? []).flatMap((d) => d.recipes.map((r) => r.id)))], [week]);
  const ids = [...selected];

  function reset() { setMerged(null); setResult(null); setError(null); setInfo(null); }
  const toggle = (id: string) => { reset(); setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  const manualItems = manual.split("\n").map((l) => l.trim()).filter(Boolean);
  const ready = source === "recipes" ? ids.length > 0 : source === "manual" ? manualItems.length > 0 : true;

  async function merge() {
    setBusy("merge"); setError(null); setInfo(null);
    try {
      if (source === "recipes") setMerged((await api.combine(ids)).items);
      
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function optimize() {
    setBusy("optimize"); setError(null); setInfo(null);
    try {
      setResult(
        await api.optimize(
          source === "recipes" ? { source, recipeIds: ids, retailers: markets } : source === "manual" ? { source, items: manualItems, retailers: markets } : { source: "list" as const, retailers: markets },
        ),
      );
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function addToList() {
    setBusy("list"); setError(null);
    try {
      const r = await api.importList({ source: "recipes", recipeIds: ids });
      setInfo(`${r.imported ?? 0} Zutaten wurden zu deiner Einkaufsliste hinzugefügt.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function sync() {
    setBusy("sync"); setError(null);
    try {
      await api.syncShoppingList(ids);
      setInfo("Die Zutaten stehen jetzt in deiner Cookidoo-Einkaufsliste.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div>
      <h1 className="text-4xl sm:text-5xl mb-5">Einkauf planen</h1>

      <div role="tablist" aria-label="Quelle der Zutaten" className="inline-flex rounded-2xl border border-border bg-card p-1 gap-1">
        {([["recipes", "Wochenplan"], ["list", "Meine Liste"], ["manual", "Freie Eingabe"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={source === k} onClick={() => { setSource(k); reset(); }}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${source === k ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l}</button>
        ))}
      </div>

      {source === "recipes" && (
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="outline" onClick={() => { setAnchor(addDays(anchor, -7)); reset(); }} aria-label="Vorherige Woche">‹</Button>
            <div className="font-display text-xl">Woche ab {fmt(isoDate(anchor))}</div>
            <Button variant="outline" onClick={() => { setAnchor(addDays(anchor, 7)); reset(); }} aria-label="Nächste Woche">›</Button>
            {allRecipeIds.length > 0 && (
              <Button variant="outline" className="ml-auto" onClick={() => { reset(); setSelected(selected.size === allRecipeIds.length ? new Set() : new Set(allRecipeIds)); }}>
                {selected.size === allRecipeIds.length ? "Auswahl aufheben" : "Alle auswählen"}
              </Button>
            )}
          </div>
          {weekErr && <Notice tone="error">{weekErr}</Notice>}
          {!week && !weekErr && <Spinner label="Wochenplan wird geladen …" />}
          {week && allRecipeIds.length === 0 && <Notice>In dieser Woche sind keine Rezepte eingeplant. Plane Rezepte in Cookidoo ein oder wähle eine andere Woche.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {week?.filter((d) => d.recipes.length).map((d) => (
              <fieldset key={d.id} className="rounded-2xl border border-border bg-card p-4">
                <legend className="font-display text-lg px-1">{d.title}</legend>
                {d.recipes.map((r) => (
                  <label key={r.id} className="flex gap-3 items-center py-1.5 cursor-pointer">
                    <input type="checkbox" className="size-5 accent-primary" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    {r.thumbnail && <img src={r.thumbnail} alt="" className="size-12 rounded object-cover" loading="lazy" />}
                    <span className="text-sm leading-snug">{r.name}{r.totalTime ? <span className="text-muted-foreground"> · {Math.round(r.totalTime / 60)} min</span> : null}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>
      )}

      {source === "manual" && (
        <div className="mt-5 max-w-xl">
          <label className="block text-sm font-semibold mb-1" htmlFor="manual">Eine Zutat pro Zeile</label>
          <textarea id="manual" className={`${inputCls} min-h-40 font-body`} value={manual}
            onChange={(e) => { setManual(e.target.value); reset(); }} placeholder={"Tomaten\nMozzarella\nMehl\nButter"} />
          <p className="text-xs text-muted-foreground mt-1">Mengen sind hier nicht nötig: Pro Zeile wird eine Packung gerechnet.</p>
        </div>
      )}

      {source === "list" && (
        <p className="mt-5 text-sm text-muted-foreground max-w-xl">Es werden die offenen Zutaten deiner Einkaufsliste verglichen. Abgehakte und zu Hause vorhandene Zutaten werden komplett übersprungen.</p>
      )}

      <section className="mt-8" aria-label="Märkte für diesen Einkauf">
        <h2 className="text-2xl mb-1">Wo kaufst du ein?</h2>
        <p className="text-sm text-muted-foreground mb-3">Der Plan nutzt nur Angebote der gewählten Märkte. Ohne Auswahl werden alle verglichen.</p>
        <MarketPicker markets={markets} onToggle={(id) => { setResult(null); toggleMarket(id); }} onClear={() => { setResult(null); setMarkets([]); }} />
      </section>

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        {source === "recipes" && (
          <Button variant="outline" onClick={merge} disabled={!ready || busy !== null}>{busy === "merge" ? "Zusammenführen …" : "Zutaten zusammenführen"}</Button>
        )}
        <Button variant="default" onClick={optimize} disabled={!ready || busy !== null}>{busy === "optimize" ? "Angebote werden verglichen …" : "Einkauf optimieren"}</Button>
        {source === "recipes" && ids.length > 0 && (
          <Button variant="outline" onClick={addToList} disabled={busy !== null}>{busy === "list" ? "Hinzufügen …" : "In meine Liste"}</Button>
        )}
        {source === "recipes" && ids.length > 0 && (
          <Button variant="outline" onClick={sync} disabled={busy !== null}>{busy === "sync" ? "Übertragen …" : "In Cookidoo-Liste übernehmen"}</Button>
        )}
        {source === "recipes" && <span className="text-sm text-muted-foreground">{ids.length} {ids.length === 1 ? "Rezept" : "Rezepte"} gewählt</span>}
      </div>

      <div className="mt-4 space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice>{info}</Notice>}
      </div>

      {merged && (
        <section className="mt-8" aria-label="Zusammengeführte Zutaten">
          <h2 className="text-2xl mb-3">Zutaten insgesamt ({merged.length})</h2>
          <AggregatedList items={merged} />
        </section>
      )}
      {result && <PlanView data={result} />}
    </div>
  );
}
