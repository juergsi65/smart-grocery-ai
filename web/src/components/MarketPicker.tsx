import { useEffect, useState } from "react";
import { api } from "../api";
import type { RetailerFacet } from "../types";
import { RetailerLogo } from "./Media";

/** Chip-Leiste zur Marktauswahl. Leere Auswahl = alle Maerkte. */
export function MarketPicker({ markets, onToggle, onClear, facets }: {
  markets: string[]; onToggle: (id: string) => void; onClear: () => void; facets?: RetailerFacet[];
}) {
  const [own, setOwn] = useState<RetailerFacet[] | null>(null);
  useEffect(() => {
    if (facets) return;
    api.retailers().then(setOwn).catch(() => setOwn([]));
  }, [facets]);
  const list = facets ?? own;
  if (!list) return <div className="h-11 rounded-full bg-muted/50 animate-pulse w-2/3" />;
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Märkte mit Angeboten.</p>;
  // Auch gewaehlte Maerkte ohne Treffer in der aktuellen Facette sichtbar halten
  const shown = [...list];
  for (const id of markets) if (!shown.some((r) => r.id === id)) shown.push({ id, name: id, logo: null, n: 0, max_discount: null });

  return (
    <div role="group" aria-label="Märkte auswählen" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap snap-x">
      <button onClick={onClear} aria-pressed={markets.length === 0}
        className={`snap-start shrink-0 rounded-full border px-4 h-11 text-sm font-semibold ${markets.length === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"}`}>
        Alle Märkte
      </button>
      {shown.map((r) => {
        const on = markets.includes(r.id);
        const name = r.name ?? r.id;
        return (
          <button key={r.id} onClick={() => onToggle(r.id)} aria-pressed={on}
            className={`snap-start shrink-0 inline-flex items-center gap-2 rounded-full border pl-1.5 pr-4 h-11 text-sm font-semibold transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"}`}>
            <RetailerLogo src={r.logo} name={name} size={30} />
            <span>{name}</span>
            <span className={`text-xs font-medium ${on ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{r.n}</span>
          </button>
        );
      })}
    </div>
  );
}
