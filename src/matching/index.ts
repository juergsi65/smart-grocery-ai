/**
 * Zutat -> Angebote. Stufen:
 *  1. Kandidaten per LIKE-Vorfilter aus D1
 *  2. lexikalischer Score: >= STRONG automatisch akzeptiert
 *  3. WEAK..STRONG mehrdeutig -> Workers AI entscheidet (mit D1-Cache)
 * Ergebnis: je Zutat hoechstens 2 Angebote pro Haendler (beste Grundpreise).
 */
import type { Env } from "../env";
import { normalizeName } from "../cookidoo/aggregate";
import { candidateOffersBatch } from "../offers/store";
import type { OfferRow } from "../offers/types";
import { aiAccept, type AiTask } from "./ai";
import { STRONG, WEAK, fallbackAccept, lexicalScore, looksProcessed } from "./lexical";

export interface MatchedOffer extends OfferRow {
  score: number;
  via: "lexical" | "ai" | "fallback";
}

export interface MatchResult {
  byKey: Map<string, MatchedOffer[]>;
  stats: { ingredients: number; withOffers: number; aiTasks: number; aiAccepted: number; fallbackAccepted: number };
}

const PER_RETAILER = 2;
const AI_CANDIDATES = 8;

function limitPerRetailer(list: MatchedOffer[]): MatchedOffer[] {
  const sorted = [...list].sort(
    (a, b) =>
      (a.unit_price_cents ?? Number.MAX_SAFE_INTEGER) - (b.unit_price_cents ?? Number.MAX_SAFE_INTEGER) ||
      a.price_cents - b.price_cents,
  );
  const count = new Map<string, number>();
  const out: MatchedOffer[] = [];
  for (const o of sorted) {
    const n = count.get(o.retailer_id) ?? 0;
    if (n >= PER_RETAILER) continue;
    count.set(o.retailer_id, n + 1);
    out.push(o);
  }
  return out;
}

export async function matchIngredients(env: Env, names: string[], opts: { useAi?: boolean } = {}): Promise<MatchResult> {
  const useAi = opts.useAi ?? true;
  const unique = [...new Set(names)];
  const candidateLists = await candidateOffersBatch(env, unique);

  const byKey = new Map<string, MatchedOffer[]>();
  const aiTasks: AiTask[] = [];
  const ambiguous = new Map<string, MatchedOffer[]>();

  unique.forEach((name, idx) => {
    const key = normalizeName(name);
    const scored = candidateLists[idx]
      .map((o): MatchedOffer => ({ ...o, score: lexicalScore(name, o), via: "lexical" }))
      .filter((o) => o.score >= WEAK);
    const strong = scored.filter((o) => o.score >= STRONG && !looksProcessed(o.product_name, name));
    const weak = scored.filter((o) => !strong.includes(o)).sort((a, b) => b.score - a.score).slice(0, AI_CANDIDATES);
    byKey.set(key, strong);
    if (weak.length) {
      ambiguous.set(key, weak);
      if (useAi) aiTasks.push({ key, name, candidates: weak });
    }
  });

  let aiAccepted = 0;
  const decided = new Set<string>();
  if (aiTasks.length) {
    const decisions = await aiAccept(env, aiTasks);
    for (const [key, ids] of decisions) {
      decided.add(key);
      const pool = ambiguous.get(key) ?? [];
      const accepted = pool.filter((o) => ids.includes(o.id)).map((o): MatchedOffer => ({ ...o, via: "ai" }));
      aiAccepted += accepted.length;
      byKey.set(key, [...(byKey.get(key) ?? []), ...accepted]);
    }
  }
  // Fallback ohne KI-Entscheidung (KI aus, Fehler, Limit): Produktkern vorn + kein Verarbeitungs-Signal.
  let fallbackAccepted = 0;
  const nameByKey = new Map(unique.map((n) => [normalizeName(n), n]));
  for (const [key, pool] of ambiguous) {
    if (decided.has(key)) continue;
    const name = nameByKey.get(key) ?? key;
    const ok = pool.filter((o) => fallbackAccept(name, o)).map((o): MatchedOffer => ({ ...o, via: "fallback" }));
    fallbackAccepted += ok.length;
    byKey.set(key, [...(byKey.get(key) ?? []), ...ok]);
  }

  let withOffers = 0;
  for (const [key, list] of byKey) {
    const limited = limitPerRetailer(list);
    byKey.set(key, limited);
    if (limited.length) withOffers++;
  }
  return { byKey, stats: { ingredients: unique.length, withOffers, aiTasks: aiTasks.length, aiAccepted, fallbackAccepted } };
}
