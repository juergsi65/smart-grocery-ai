import { z } from "zod";
import type { Env } from "../env";
import { fold, parsePack, tokens, unitPriceCents } from "../offers/normalize";
import type { NormalizedOffer, OfferRow } from "../offers/types";

export interface BaseRow {
  id: number; retailer_id: string; product_name: string; brand: string | null; description: string | null;
  price_cents: number; unit_price_cents: number | null; unit_price_basis: string | null;
  pack_amount: number | null; pack_dimension: "mass" | "volume" | "count" | null;
  source: "learned" | "manual"; updated_at: number; retailer_name?: string | null; retailer_logo?: string | null;
}

export const BasePriceInput = z.object({
  retailer: z.string().trim().min(1).max(60),
  product: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(80).optional(),
  pack: z.string().trim().max(40).optional(), // "500 g", "1 l", "10 Stk"
  price: z.number().positive().max(10000), // Euro
});

const productKey = (name: string, amount: number | null) => `${fold(name)}|${amount ?? ""}`;

function upsertStmt(env: Env, p: {
  retailer: string; name: string; brand: string | null; description: string | null; priceCents: number; source: "learned" | "manual";
}, now: number): D1PreparedStatement {
  const pack = parsePack(`${p.name} ${p.description ?? ""}`);
  const up = unitPriceCents(p.priceCents, pack);
  return env.DB.prepare(
    `INSERT INTO base_prices (retailer_id, product_key, product_name, search_text, brand, description, price_cents,
       unit_price_cents, unit_price_basis, pack_amount, pack_dimension, source, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(retailer_id, product_key) DO UPDATE SET
       product_name=excluded.product_name, search_text=excluded.search_text, brand=excluded.brand, description=excluded.description,
       price_cents=excluded.price_cents, unit_price_cents=excluded.unit_price_cents, unit_price_basis=excluded.unit_price_basis,
       pack_amount=excluded.pack_amount, pack_dimension=excluded.pack_dimension, source=excluded.source, updated_at=excluded.updated_at
     WHERE base_prices.source != 'manual' OR excluded.source = 'manual'`,
  ).bind(
    p.retailer, productKey(p.name, pack.amount), p.name, fold([p.name, p.brand, p.description].filter(Boolean).join(" ")),
    p.brand, p.description, p.priceCents, up?.cents ?? null, up?.basis ?? null, pack.amount, pack.dimension, p.source, now,
  );
}

/** Aus Aktionen lernen: der Streichpreis ist der bisherige Normalpreis dieses Produkts beim Haendler. */
export function learnedStatements(env: Env, offers: NormalizedOffer[], now: number): D1PreparedStatement[] {
  const seen = new Set<string>();
  const out: D1PreparedStatement[] = [];
  for (const o of offers) {
    if (!o.oldPriceCents || o.oldPriceCents <= o.priceCents) continue;
    const k = `${o.retailerId}|${fold(o.productName)}|${o.description ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(upsertStmt(env, { retailer: o.retailerId, name: o.productName, brand: o.brand, description: o.description, priceCents: o.oldPriceCents, source: "learned" }, now));
  }
  return out;
}

export async function putManualPrice(env: Env, i: z.infer<typeof BasePriceInput>): Promise<void> {
  await upsertStmt(env, {
    retailer: i.retailer.toLowerCase().replace(/\s+/g, "-"), name: i.product, brand: i.brand ?? null,
    description: i.pack ?? null, priceCents: Math.round(i.price * 100), source: "manual",
  }, Date.now()).run();
}

export async function listBasePrices(env: Env, q?: string, retailer?: string, limit = 100): Promise<BaseRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  for (const t of tokens(q ?? "").slice(0, 4)) { where.push("b.search_text LIKE ?"); binds.push(`%${t}%`); }
  if (retailer) { where.push("b.retailer_id = ?"); binds.push(retailer.toLowerCase()); }
  const { results } = await env.DB.prepare(
    `SELECT b.*, r.name AS retailer_name, r.logo_url AS retailer_logo FROM base_prices b LEFT JOIN retailers r ON r.id = b.retailer_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY b.source = 'manual' DESC, b.updated_at DESC LIMIT ?`,
  ).bind(...binds, limit).all<BaseRow>();
  return results ?? [];
}

export async function deleteBasePrice(env: Env, id: number): Promise<boolean> {
  const r = await env.DB.prepare("DELETE FROM base_prices WHERE id = ?").bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Normalpreis-Kandidaten je Zutat (ein D1-Roundtrip), Ergebnis in Eingabereihenfolge. */
export async function candidateBaseBatch(env: Env, names: string[], retailers: string[], limit = 60): Promise<BaseRow[][]> {
  if (!retailers.length) return names.map(() => []);
  const rIn = retailers.map(() => "?").join(",");
  const stmts = names.map((name) => {
    const toks = tokens(name).filter((t) => t.length >= 4).slice(0, 4);
    if (!toks.length) return env.DB.prepare("SELECT 1 WHERE 0");
    return env.DB.prepare(
      `SELECT b.*, r.name AS retailer_name, r.logo_url AS retailer_logo FROM base_prices b LEFT JOIN retailers r ON r.id = b.retailer_id
       WHERE (${toks.map(() => "b.search_text LIKE ?").join(" OR ")}) AND b.retailer_id IN (${rIn}) LIMIT ?`,
    ).bind(...toks.map((t) => `%${t}%`), ...retailers, limit);
  });
  const out: BaseRow[][] = [];
  for (let i = 0; i < stmts.length; i += 80) {
    const res = await env.DB.batch<BaseRow>(stmts.slice(i, i + 80));
    for (const r of res) out.push(r.results ?? []);
  }
  return out;
}

/** BaseRow als OfferRow-aehnliche Zeile (negative id = kein Flugblatt-Angebot). */
export function baseAsOffer(b: BaseRow): OfferRow {
  return {
    id: -b.id, source: "base", retailer_id: b.retailer_id, retailer_name: b.retailer_name ?? undefined,
    product_name: b.product_name, brand: b.brand, description: b.description, price_cents: b.price_cents, old_price_cents: null,
    unit_price_cents: b.unit_price_cents, unit_price_basis: b.unit_price_basis, pack_amount: b.pack_amount,
    pack_dimension: b.pack_dimension, valid_from: null, valid_to: null, image_url: null, category: null, discount_pct: null,
    retailer_logo: b.retailer_logo ?? null,
  };
}
