import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { MarketPicker } from "../components/MarketPicker";
import { PlanView } from "../components/PlanView";
import { useMarkets } from "../lib/markets";
import { Button, Notice, Spinner, inputCls } from "../components/ui";
import type { Aggregated, OptimizeResponse, WeekDay } from "../types";

type Source = "recipes" | "shopping-list" | "manual";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const fmt = (iso: string) => new Date(iso).toLocaleDateString("de-AT", { day: "numeric", month: "long" });

function AggregatedList({ items }: { items: Aggregated[] }) {
  return (
    <ul className="columns-1 sm:columns-2 gap-8 text-sm">
      {items.map((i) => (
        <li key={i.name} className="break-inside-avoid py-1.5 border-b border-line">
          {i.display}
          {i.sourceRecipeNames.length > 1 && (
            <span className="text-ink-soft"> · in {i.sourceRecipeNames.length} Rezepten</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Plan() {
  const { markets, toggle: toggleMarket, set: setMarkets } = useMarkets();
  const [source, setSource] = useState<Source>("recipes");
  const [anchor, setAnchor] = useState(() => new Date());
  const [week, setWeek] = useState<WeekDay[] | null>(null);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [merged, setMerged] = useState<Aggregated[] | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [busy, setBusy] = useState<null | "merge" | "optimize" | "sync">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
      else if (source === "shopping-list") setMerged((await api.shoppingList()).aggregated);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function optimize() {
    setBusy("optimize"); setError(null); setInfo(null);
    try {
      setResult(
        await api.optimize(
          source === "recipes" ? { source, recipeIds: ids, retailers: markets } : source === "manual" ? { source, items: manualItems, retailers: markets } : { source, retailers: markets },
        ),
      );
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

      <div role="tablist" aria-label="Quelle der Zutaten" className="inline-flex rounded-md border border-line bg-card p-1 gap-1">
        {([["recipes", "Wochenplan"], ["shopping-list", "Cookidoo-Einkaufsliste"], ["manual", "Eigene Liste"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={source === k} onClick={() => { setSource(k); reset(); }}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${source === k ? "bg-ink text-paper" : "hover:bg-mint"}`}>{l}</button>
        ))}
      </div>

      {source === "recipes" && (
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" onClick={() => { setAnchor(addDays(anchor, -7)); reset(); }} aria-label="Vorherige Woche">‹</Button>
            <div className="font-display text-xl">Woche ab {fmt(isoDate(anchor))}</div>
            <Button variant="ghost" onClick={() => { setAnchor(addDays(anchor, 7)); reset(); }} aria-label="Nächste Woche">›</Button>
            {allRecipeIds.length > 0 && (
              <Button variant="ghost" className="ml-auto" onClick={() => { reset(); setSelected(selected.size === allRecipeIds.length ? new Set() : new Set(allRecipeIds)); }}>
                {selected.size === allRecipeIds.length ? "Auswahl aufheben" : "Alle auswählen"}
              </Button>
            )}
          </div>
          {weekErr && <Notice tone="error">{weekErr}</Notice>}
          {!week && !weekErr && <Spinner label="Wochenplan wird geladen …" />}
          {week && allRecipeIds.length === 0 && <Notice>In dieser Woche sind keine Rezepte eingeplant. Plane Rezepte in Cookidoo ein oder wähle eine andere Woche.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {week?.filter((d) => d.recipes.length).map((d) => (
              <fieldset key={d.id} className="rounded-md border border-line bg-card p-4">
                <legend className="font-display text-lg px-1">{d.title}</legend>
                {d.recipes.map((r) => (
                  <label key={r.id} className="flex gap-3 items-center py-1.5 cursor-pointer">
                    <input type="checkbox" className="size-5 accent-[#14231f]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    {r.thumbnail && <img src={r.thumbnail} alt="" className="size-12 rounded object-cover" loading="lazy" />}
                    <span className="text-sm leading-snug">{r.name}{r.totalTime ? <span className="text-ink-soft"> · {Math.round(r.totalTime / 60)} min</span> : null}</span>
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
          <p className="text-xs text-ink-soft mt-1">Mengen sind hier nicht nötig: Pro Zeile wird eine Packung gerechnet.</p>
        </div>
      )}

      {source === "shopping-list" && (
        <p className="mt-5 text-sm text-ink-soft max-w-xl">Es wird die Liste verwendet, die du in Cookidoo gerade geführt hast. Zutaten, die du schon zu Hause hast und in Cookidoo abgehakt sind, bleiben in der Liste.</p>
      )}

      <section className="mt-8" aria-label="Märkte für diesen Einkauf">
        <h2 className="text-2xl mb-1">Wo kaufst du ein?</h2>
        <p className="text-sm text-ink-soft mb-3">Der Plan nutzt nur Angebote der gewählten Märkte. Ohne Auswahl werden alle verglichen.</p>
        <MarketPicker markets={markets} onToggle={(id) => { setResult(null); toggleMarket(id); }} onClear={() => { setResult(null); setMarkets([]); }} />
      </section>

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        {source !== "manual" && (
          <Button variant="ghost" onClick={merge} disabled={!ready || busy !== null}>{busy === "merge" ? "Zusammenführen …" : "Zutaten zusammenführen"}</Button>
        )}
        <Button variant="tag" onClick={optimize} disabled={!ready || busy !== null}>{busy === "optimize" ? "Angebote werden verglichen …" : "Einkauf optimieren"}</Button>
        {source === "recipes" && ids.length > 0 && (
          <Button variant="ghost" onClick={sync} disabled={busy !== null}>{busy === "sync" ? "Übertragen …" : "In Cookidoo-Liste übernehmen"}</Button>
        )}
        {source === "recipes" && <span className="text-sm text-ink-soft">{ids.length} {ids.length === 1 ? "Rezept" : "Rezepte"} gewählt</span>}
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
