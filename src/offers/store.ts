/** Persistenz und Abfrage von Angeboten in D1. */
import type { Env } from "../env";
import { fold, parsePack, tokens, unitPriceCents } from "./normalize";
import type { NormalizedOffer, OfferRow } from "./types";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Upsert per (source, external_id); ohne external_id wird ein stabiler Schluessel gebildet. */
export async function upsertOffers(env: Env, offers: NormalizedOffer[]): Promise<number> {
  if (!offers.length) return 0;
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  const seenRetailers = new Map<string, string>();

  for (const o of offers) {
    seenRetailers.set(o.retailerId, o.retailerName);
    const ext =
      o.externalId ?? `${o.retailerId}|${fold(o.productName)}|${o.priceCents}|${o.validFrom ?? ""}`;
    const pack = parsePack(`${o.productName} ${o.description ?? ""}`);
    const up = unitPriceCents(o.priceCents, pack);
    const search = fold([o.productName, o.brand, o.description].filter(Boolean).join(" "));
    stmts.push(
      env.DB.prepare(
        `INSERT INTO offers (source, external_id, retailer_id, product_name, search_text, brand, description,
           price_cents, old_price_cents, unit_price_cents, unit_price_basis, pack_amount, pack_dimension,
           valid_from, valid_to, image_url, fetched_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(source, external_id) DO UPDATE SET
           retailer_id=excluded.retailer_id, product_name=excluded.product_name, search_text=excluded.search_text,
           brand=excluded.brand, description=excluded.description, price_cents=excluded.price_cents,
           old_price_cents=excluded.old_price_cents, unit_price_cents=excluded.unit_price_cents,
           unit_price_basis=excluded.unit_price_basis, pack_amount=excluded.pack_amount,
           pack_dimension=excluded.pack_dimension, valid_from=excluded.valid_from, valid_to=excluded.valid_to,
           image_url=excluded.image_url, fetched_at=excluded.fetched_at`,
      ).bind(
        o.source, ext, o.retailerId, o.productName, search, o.brand, o.description,
        o.priceCents, o.oldPriceCents, up?.cents ?? null, up?.basis ?? null, pack.amount, pack.dimension,
        o.validFrom, o.validTo, o.imageUrl, now,
      ),
    );
  }
  for (const [id, name] of seenRetailers) {
    stmts.push(env.DB.prepare("INSERT INTO retailers (id, name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name = CASE WHEN excluded.name = retailers.id THEN retailers.name ELSE excluded.name END").bind(id, name));
  }
  // D1 batch: in Bloecken, um Limits sicher einzuhalten.
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return offers.length;
}

export async function deleteExpired(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM offers WHERE valid_to IS NOT NULL AND valid_to < ?").bind(todayIso()).run();
}

const SELECT_COLS = `o.id, o.source, o.retailer_id, r.name AS retailer_name, o.product_name, o.brand, o.description,
  o.price_cents, o.old_price_cents, o.unit_price_cents, o.unit_price_basis, o.pack_amount, o.pack_dimension,
  o.valid_from, o.valid_to, o.image_url`;

/** Nur aktuell gueltige Angebote (valid_from <= heute <= valid_to, fehlende Daten = gueltig). */
const ACTIVE = `(o.valid_to IS NULL OR o.valid_to >= ?) AND (o.valid_from IS NULL OR o.valid_from <= ?)`;

/**
 * Kandidaten-Vorfilter: Angebote, deren search_text mindestens einen (gestemmten) Zutaten-Token enthaelt.
 * Der Teilstring-Match deckt deutsche Komposita ab ("tomate" in "cocktailtomaten").
 */
export async function candidateOffers(env: Env, ingredientName: string, limit = 60): Promise<OfferRow[]> {
  const toks = tokens(ingredientName).filter((t) => t.length >= 4).slice(0, 4);
  if (!toks.length) return [];
  const today = todayIso();
  const likes = toks.map(() => "o.search_text LIKE ?").join(" OR ");
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id
     WHERE (${likes}) AND ${ACTIVE} LIMIT ?`,
  )
    .bind(...toks.map((t) => `%${t}%`), today, today, limit)
    .all<OfferRow>();
  return results ?? [];
}

/** Kandidaten fuer viele Zutaten mit EINEM D1-Roundtrip (batch). Ergebnis in Eingabereihenfolge. */
export async function candidateOffersBatch(env: Env, names: string[], limit = 80): Promise<OfferRow[][]> {
  const today = todayIso();
  const stmts: D1PreparedStatement[] = names.map((name) => {
    const toks = tokens(name).filter((t) => t.length >= 4).slice(0, 4);
    if (!toks.length) return env.DB.prepare("SELECT 1 WHERE 0");
    const likes = toks.map(() => "o.search_text LIKE ?").join(" OR ");
    return env.DB.prepare(
      `SELECT ${SELECT_COLS} FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id
       WHERE (${likes}) AND ${ACTIVE} LIMIT ?`,
    ).bind(...toks.map((t) => `%${t}%`), today, today, limit);
  });
  const out: OfferRow[][] = [];
  for (let i = 0; i < stmts.length; i += 80) {
    const res = await env.DB.batch<OfferRow>(stmts.slice(i, i + 80));
    for (const r of res) out.push(r.results ?? []);
  }
  return out;
}

export async function searchOffers(env: Env, q: string, retailer?: string, limit = 50): Promise<OfferRow[]> {
  const toks = tokens(q).slice(0, 4);
  const today = todayIso();
  const where: string[] = [ACTIVE];
  const binds: unknown[] = [today, today];
  for (const t of toks) {
    where.push("o.search_text LIKE ?");
    binds.push(`%${t}%`);
  }
  if (retailer) {
    where.push("o.retailer_id = ?");
    binds.push(retailer.toLowerCase());
  }
  binds.push(limit);
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id
     WHERE ${where.join(" AND ")} ORDER BY o.unit_price_cents IS NULL, o.unit_price_cents, o.price_cents LIMIT ?`,
  )
    .bind(...binds)
    .all<OfferRow>();
  return results ?? [];
}

export async function offersByIds(env: Env, ids: number[]): Promise<OfferRow[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id WHERE o.id IN (${ph})`,
  )
    .bind(...ids)
    .all<OfferRow>();
  return results ?? [];
}

export async function offerStats(env: Env) {
  const today = todayIso();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM offers o WHERE ${ACTIVE}`).bind(today, today).first<{ n: number }>();
  const { results: retailers } = await env.DB.prepare(
    `SELECT o.retailer_id AS id, r.name AS name, COUNT(*) AS n FROM offers o LEFT JOIN retailers r ON r.id=o.retailer_id
     WHERE ${ACTIVE} GROUP BY o.retailer_id ORDER BY n DESC`,
  ).bind(today, today).all();
  const { results: runs } = await env.DB.prepare(
    "SELECT source, started_at, ok, count, message FROM ingest_runs ORDER BY id DESC LIMIT 10",
  ).all();
  return { activeOffers: total?.n ?? 0, retailers: retailers ?? [], recentRuns: runs ?? [] };
}
