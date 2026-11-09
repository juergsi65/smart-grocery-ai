/**
 * PriceResolver: zweistufige Preisfindung je Zutat und Haendler.
 *   Stufe 1 (Offer Check):  aktuelles Aktionsangebot -> is_on_sale = true
 *   Stufe 2 (Base Price):   regulaerer Preis des Haendlers, in dieser Reihenfolge
 *                           a) manuell gepflegt / b) aus Streichpreisen gelernt / c) Richtwert (geschaetzt)
 * Nur Zutaten, die noch gebraucht werden, kommen hier an (is_bought / in_pantry sind vorher gefiltert).
 * Pro Haendler wird ein Normalpreis nur ergaenzt, wenn dort kein Angebot existiert.
 */
import type { Env } from "../env";
import { lexicalScore, looksProcessed, STRONG } from "../matching/lexical";
import { matchIngredients, type MatchedOffer } from "../matching";
import type { Need } from "../optimizer";
import { findReference, estimatePrice } from "./reference";
import { FOOD_RETAILERS, RETAILER_BY_ID } from "./retailers";
import { baseAsOffer, candidateBaseBatch, type BaseRow } from "./store";

export interface ResolveStats {
  ingredients: number;
  onSale: number;
  basePrices: number;
  estimated: number;
  unresolved: number;
}

export interface ResolveInput {
  needs: Need[];
  /** Angebote aus Stufe 1, je normalisiertem Zutatenschluessel. */
  offers: Map<string, MatchedOffer[]>;
  /** Normalpreis-Kandidaten je Zutat (Reihenfolge wie needs). */
  base: BaseRow[][];
  retailerIds: string[];
  names: Map<string, string | null>;
  logos: Map<string, string | null>;
}

/** Reine Kernlogik (ohne D1) - testbar. */
export function resolveFromData(inp: ResolveInput): { byKey: Map<string, MatchedOffer[]>; stats: ResolveStats } {
  const byKey = new Map<string, MatchedOffer[]>();
  const stats: ResolveStats = { ingredients: inp.needs.length, onSale: 0, basePrices: 0, estimated: 0, unresolved: 0 };
  const scope = new Set(inp.retailerIds);

  inp.needs.forEach((need, idx) => {
    const out: MatchedOffer[] = [];
    const hasOffer = new Set<string>();
    // Stufe 1
    for (const o of inp.offers.get(need.key) ?? []) {
      if (!scope.has(o.retailer_id)) continue;
      out.push({ ...o, is_on_sale: true, price_source: "offer" });
      hasOffer.add(o.retailer_id);
    }
    // Stufe 2a/2b: gespeicherte Normalpreise (manuell vor gelernt)
    const bestBase = new Map<string, { row: BaseRow; score: number }>();
    for (const b of inp.base[idx] ?? []) {
      if (hasOffer.has(b.retailer_id) || !scope.has(b.retailer_id)) continue;
      const s = lexicalScore(need.name, b);
      if (s < STRONG || looksProcessed(b.product_name, need.name)) continue;
      const cur = bestBase.get(b.retailer_id);
      const better = !cur || (b.source === "manual" && cur.row.source !== "manual") ||
        (b.source === cur.row.source && (s > cur.score || (s === cur.score && b.price_cents < cur.row.price_cents)));
      if (better) bestBase.set(b.retailer_id, { row: b, score: s });
    }
    for (const [rid, { row, score }] of bestBase) {
      out.push({ ...baseAsOffer(row), retailer_name: inp.names.get(rid) ?? row.retailer_name ?? rid, retailer_logo: inp.logos.get(rid) ?? row.retailer_logo ?? null,
        score, via: "lexical", is_on_sale: false, price_source: row.source });
      stats.basePrices++;
    }
    // Stufe 2c: Richtwert fuer alle uebrigen Haendler
    const ref = findReference(need.name);
    if (ref) {
      let nextId = -1_000_000 - idx * 100;
      for (const rid of inp.retailerIds) {
        if (hasOffer.has(rid) || bestBase.has(rid)) continue;
        const factor = RETAILER_BY_ID.get(rid)?.factor ?? 1.1;
        const est = estimatePrice(ref, factor);
        out.push({
          id: nextId--, source: "estimate", retailer_id: rid, retailer_name: inp.names.get(rid) ?? rid,
          product_name: ref.names[0], brand: null, description: null, price_cents: est.cents, old_price_cents: null,
          unit_price_cents: est.unit?.cents ?? null, unit_price_basis: est.unit?.basis ?? null,
          pack_amount: est.pack.amount, pack_dimension: est.pack.dimension, valid_from: null, valid_to: null, image_url: null,
          category: need.category, discount_pct: null, retailer_logo: inp.logos.get(rid) ?? null,
          score: 1, via: "lexical", is_on_sale: false, price_source: "estimate",
        });
        stats.estimated++;
      }
    }
    if (hasOffer.size) stats.onSale++;
    if (!out.length) stats.unresolved++;
    byKey.set(need.key, out);
  });
  return { byKey, stats };
}

/** D1-Variante: Angebote matchen, Normalpreise laden, zusammenfuehren. */
export async function resolvePrices(
  env: Env,
  needs: Need[],
  opts: { retailers?: string[]; useAi?: boolean } = {},
) {
  const m = await matchIngredients(env, needs.map((n) => n.name), { useAi: opts.useAi });
  const offerRetailers = new Set<string>();
  for (const l of m.byKey.values()) for (const o of l) offerRetailers.add(o.retailer_id);
  const retailerIds = opts.retailers?.length
    ? opts.retailers
    : [...new Set([...FOOD_RETAILERS.map((r) => r.id), ...offerRetailers])];

  const base = await candidateBaseBatch(env, needs.map((n) => n.name), retailerIds);
  const { results } = await env.DB.prepare("SELECT id, name, logo_url FROM retailers").all<{ id: string; name: string; logo_url: string | null }>();
  const names = new Map<string, string | null>(FOOD_RETAILERS.map((r) => [r.id, r.name]));
  const logos = new Map<string, string | null>();
  for (const r of results ?? []) {
    if (!names.has(r.id) || r.name !== r.id) names.set(r.id, r.name);
    logos.set(r.id, r.logo_url);
  }
  const r = resolveFromData({ needs, offers: m.byKey, base, retailerIds, names, logos });
  return { ...r, retailerIds, matching: m.stats };
}
