/**
 * Einkaufs-Optimizer: waehlt aus den gematchten Angeboten die Haendler-Kombination,
 * die Komfort (wenige Stopps, viel abgedeckt) mit Preis ausbalanciert.
 *
 * Bewertung einer Haendlermenge S:
 *   Score(S) = Summe ueber abgedeckte Zutaten i von
 *              coverageBonus - (Kosten_S(i) - Kosten_guenstigste(i)) + Ersparnis_S(i)
 * - Kosten_S(i): guenstigstes Angebot der Zutat innerhalb S (Packungen x Preis)
 * - Kosten_guenstigste(i): guenstigstes Angebot ueber ALLE Haendler (Referenz)
 * - Ersparnis: (Streichpreis - Angebotspreis) x Packungen, falls Streichpreis bekannt
 * Der coverageBonus (Default 150 ct) drueckt aus, wie viel einem ein Haken auf der Liste
 * ohne Extra-Stopp wert ist; er ist ein einstellbarer Parameter, keine Naturkonstante.
 */
import type { MatchedOffer } from "./matching";

export type PackDim = "mass" | "volume" | "count";

export interface Need {
  key: string;
  name: string;
  display: string;
  /** Benoetigte Menge in Basiseinheit (g / ml / Stk), obere Grenze; null = unbekannt/qualitativ. */
  amount: number | null;
  dimension: PackDim | null;
}

export interface Option {
  offer: MatchedOffer;
  packs: number;
  costCents: number;
  savingsCents: number;
  /** Anteil der gekauften Menge, der ueber den Bedarf hinausgeht (0..1), null wenn nicht bestimmbar. */
  wastePct: number | null;
}

export interface PlanItem {
  key: string;
  name: string;
  display: string;
  option: Option;
}

export interface PlanStore {
  retailerId: string;
  retailerName: string;
  items: PlanItem[];
  subtotalCents: number;
}

export interface Plan {
  strategy: string;
  label: string;
  stores: PlanStore[];
  uncovered: { key: string; name: string; display: string }[];
  totalCents: number;
  savingsCents: number;
  coveredCount: number;
  totalCount: number;
}

const MAX_PACKS = 10;

export function buildOption(need: Need, offer: MatchedOffer): Option {
  let packs = 1;
  let waste: number | null = null;
  if (need.amount && need.dimension && offer.pack_amount && offer.pack_dimension === need.dimension) {
    packs = Math.min(MAX_PACKS, Math.max(1, Math.ceil(need.amount / offer.pack_amount - 1e-9)));
    const bought = packs * offer.pack_amount;
    waste = Math.max(0, (bought - need.amount) / bought);
  }
  const costCents = packs * offer.price_cents;
  const savingsCents = offer.old_price_cents && offer.old_price_cents > offer.price_cents
    ? packs * (offer.old_price_cents - offer.price_cents)
    : 0;
  return { offer, packs, costCents, savingsCents, wastePct: waste };
}

export function buildOptions(needs: Need[], matches: Map<string, MatchedOffer[]>): Map<string, Option[]> {
  const out = new Map<string, Option[]>();
  for (const n of needs) {
    const offers = matches.get(n.key) ?? [];
    out.set(n.key, offers.map((o) => buildOption(n, o)));
  }
  return out;
}

function cheapestIn(options: Option[], retailers: Set<string> | null): Option | null {
  let best: Option | null = null;
  for (const o of options) {
    if (retailers && !retailers.has(o.offer.retailer_id)) continue;
    if (!best || o.costCents < best.costCents || (o.costCents === best.costCents && o.savingsCents > best.savingsCents)) best = o;
  }
  return best;
}

function combos<T>(items: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) return void res.push([...cur]);
    for (let i = start; i < items.length; i++) {
      cur.push(items[i]);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return res;
}

export interface OptimizeParams {
  maxStores: number | null; // null = unbegrenzt
  coverageBonusCents?: number;
  label?: string;
  strategy?: string;
  allowedRetailers?: Set<string> | null;
  excludedRetailers?: Set<string> | null;
}

export function optimize(needs: Need[], options: Map<string, Option[]>, p: OptimizeParams): Plan {
  const bonus = p.coverageBonusCents ?? 150;
  const filtered = new Map<string, Option[]>();
  for (const n of needs) {
    filtered.set(
      n.key,
      (options.get(n.key) ?? []).filter(
        (o) =>
          (!p.allowedRetailers || p.allowedRetailers.size === 0 || p.allowedRetailers.has(o.offer.retailer_id)) &&
          !(p.excludedRetailers && p.excludedRetailers.has(o.offer.retailer_id)),
      ),
    );
  }

  const retailers = [...new Set([...filtered.values()].flatMap((l) => l.map((o) => o.offer.retailer_id)))].sort();
  const refCost = new Map<string, number>();
  for (const n of needs) {
    const best = cheapestIn(filtered.get(n.key) ?? [], null);
    if (best) refCost.set(n.key, best.costCents);
  }

  const scoreOf = (set: Set<string>): number => {
    let s = 0;
    for (const n of needs) {
      const best = cheapestIn(filtered.get(n.key) ?? [], set);
      if (!best) continue;
      s += bonus - (best.costCents - (refCost.get(n.key) ?? best.costCents)) + best.savingsCents;
    }
    return s;
  };

  let chosen: Set<string>;
  if (p.maxStores === null || p.maxStores >= retailers.length) {
    chosen = new Set(retailers);
  } else {
    let bestScore = -Infinity;
    chosen = new Set();
    for (const combo of combos(retailers, Math.max(1, p.maxStores))) {
      const set = new Set(combo);
      const s = scoreOf(set);
      // Tie-Break: stabil nach Haendlernamen (combos ist sortiert)
      if (s > bestScore) {
        bestScore = s;
        chosen = set;
      }
    }
  }

  const byStore = new Map<string, PlanStore>();
  const uncovered: Plan["uncovered"] = [];
  let total = 0;
  let savings = 0;
  let covered = 0;
  for (const n of needs) {
    const best = cheapestIn(filtered.get(n.key) ?? [], chosen);
    if (!best) {
      uncovered.push({ key: n.key, name: n.name, display: n.display });
      continue;
    }
    covered++;
    total += best.costCents;
    savings += best.savingsCents;
    const rid = best.offer.retailer_id;
    if (!byStore.has(rid)) {
      byStore.set(rid, { retailerId: rid, retailerName: best.offer.retailer_name ?? rid, items: [], subtotalCents: 0 });
    }
    const st = byStore.get(rid)!;
    st.items.push({ key: n.key, name: n.name, display: n.display, option: best });
    st.subtotalCents += best.costCents;
  }

  const stores = [...byStore.values()].sort((a, b) => b.items.length - a.items.length || b.subtotalCents - a.subtotalCents);
  return {
    strategy: p.strategy ?? "custom",
    label: p.label ?? "",
    stores,
    uncovered,
    totalCents: total,
    savingsCents: savings,
    coveredCount: covered,
    totalCount: needs.length,
  };
}

/** Standard-Strategien fuer die UI. */
export function planAll(
  needs: Need[],
  options: Map<string, Option[]>,
  prefs: { maxStores?: number; allowed?: Set<string> | null; excluded?: Set<string> | null } = {},
): Plan[] {
  const base = { allowedRetailers: prefs.allowed ?? null, excludedRetailers: prefs.excluded ?? null };
  const plans: Plan[] = [
    optimize(needs, options, { ...base, maxStores: 1, strategy: "one-stop", label: "Ein Geschäft" }),
    optimize(needs, options, { ...base, maxStores: 2, strategy: "two-stops", label: "Zwei Geschäfte" }),
    optimize(needs, options, { ...base, maxStores: null, strategy: "cheapest", label: "Günstigste Einzelpreise" }),
  ];
  const k = prefs.maxStores;
  if (k && k > 2) {
    plans.splice(2, 0, optimize(needs, options, { ...base, maxStores: k, strategy: `max-${k}`, label: `Bis zu ${k} Geschäfte` }));
  }
  return plans;
}
