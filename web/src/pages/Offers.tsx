import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { MarketPicker } from "../components/MarketPicker";
import { OfferCard, OfferSkeleton } from "../components/OfferCard";
import { Button, Notice } from "../components/ui";
import { CATEGORIES } from "../lib/categories";
import { useMarkets } from "../lib/markets";
import type { BrowseResponse, Sort } from "../types";

const SORTS: [Sort, string][] = [["discount", "Höchster Rabatt"], ["price", "Niedrigster Preis"], ["unit", "Grundpreis"]];
const PAGE = 24;

export function Offers({ goSettings }: { goSettings: () => void }) {
  const { markets, toggle, set } = useMarkets();
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<Sort>("discount");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async (offset: number) => {
    const id = ++reqId.current;
    try {
      const r = await api.browse({ retailers: markets, category, q: dq, sort, offset, limit: PAGE });
      if (id !== reqId.current) return;
      setError(null);
      setData((cur) => (offset > 0 && cur ? { ...r, offers: [...cur.offers, ...r.offers] } : r));
    } catch (e) {
      if (id === reqId.current) setError((e as Error).message);
    } finally {
      if (id === reqId.current) setMore(false);
    }
  }, [markets, category, dq, sort]);

  useEffect(() => { setData((d) => (d ? { ...d, offers: d.offers } : d)); load(0); }, [load]);

  const catCount = new Map(data?.categories.map((c) => [c.id, c.n]));
  const allCount = data?.categories.reduce((a, c) => a + c.n, 0) ?? 0;
  const loading = !data && !error;
  const empty = data && data.offers.length === 0;
  const noDataAtAll = empty && !category && !dq && markets.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-4xl sm:text-5xl">Aktuelle Angebote</h1>
          <p className="text-sm text-muted-foreground mt-1" aria-live="polite">
            {data ? `${data.total} Angebote${markets.length ? ` in ${markets.length} ${markets.length === 1 ? "Markt" : "Märkten"}` : " in allen Märkten"}` : " "}
          </p>
        </div>
        <input type="search" aria-label="Angebote durchsuchen" placeholder="Suchen, z. B. Mozzarella"
          value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-72 rounded-full border border-border bg-card px-4 h-11 text-base" />
      </div>

      <MarketPicker markets={markets} onToggle={toggle} onClear={() => set([])} facets={data?.retailers} />

      {/* Kategorien: klebt unter dem Header */}
      <div className="sticky top-[var(--header-h,56px)] z-10 -mx-4 px-4 py-2 mt-3 bg-background/95 backdrop-blur border-b border-border">
        <div role="group" aria-label="Kategorie" className="flex gap-2 overflow-x-auto no-scrollbar">
          <CatChip active={!category} onClick={() => setCategory(undefined)} icon="✨" label="Alle" n={allCount} />
          {CATEGORIES.map((c) => {
            const n = catCount.get(c.id) ?? 0;
            if (!n && category !== c.id) return null;
            return <CatChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} icon={c.icon} label={c.name} n={n} />;
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 mb-4 text-sm overflow-x-auto no-scrollbar whitespace-nowrap">
        <span className="text-muted-foreground shrink-0">Sortieren:</span>
        {SORTS.map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
            className={`shrink-0 rounded-full px-3 h-9 font-semibold ${sort === k ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-secondary"}`}>{l}</button>
        ))}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <ul className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {loading && Array.from({ length: 8 }, (_, i) => <OfferSkeleton key={i} />)}
        {data?.offers.map((o) => <OfferCard key={o.id} o={o} />)}
      </ul>

      {noDataAtAll && (
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="text-5xl mb-3" aria-hidden="true">🛒</div>
          <h2 className="text-2xl mb-2">Noch keine Angebote</h2>
          <p className="text-sm text-muted-foreground mb-4">Lade die aktuellen Angebote oder importiere eigene Daten.</p>
          <Button onClick={goSettings}>Zu den Angebotsdaten</Button>
        </div>
      )}
      {empty && !noDataAtAll && (
        <div className="text-center py-12">
          <div className="text-4xl mb-2" aria-hidden="true">🔍</div>
          <p className="font-semibold">Keine Angebote für diese Auswahl.</p>
          <p className="text-sm text-muted-foreground mt-1">Wähle weitere Märkte oder eine andere Kategorie.</p>
          <Button variant="outline" className="mt-4" onClick={() => { set([]); setCategory(undefined); setQ(""); }}>Filter zurücksetzen</Button>
        </div>
      )}

      {data && data.offers.length < data.total && (
        <div className="text-center mt-8">
          <Button variant="outline" disabled={more} onClick={() => { setMore(true); load(data.offers.length); }}>
            {more ? "Lädt …" : `Mehr laden (${data.total - data.offers.length} weitere)`}
          </Button>
        </div>
      )}
    </div>
  );
}

function CatChip({ active, onClick, icon, label, n }: { active: boolean; onClick: () => void; icon: string; label: string; n: number }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-10 text-sm font-semibold border ${active ? "bg-secondary border-primary text-secondary-foreground" : "bg-card border-border hover:bg-secondary"}`}>
      <span aria-hidden="true">{icon}</span>{label}<span className="text-xs text-muted-foreground font-medium">{n}</span>
    </button>
  );
}
