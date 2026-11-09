/** Persistenz und Abfrage von Angeboten in D1. */
import { categorize, discountPct } from "../categories";
import type { Env } from "../env";
import { fold, parsePack, tokens, unitPriceCents } from "./normalize";
import type { NormalizedOffer, OfferRow } from "./types";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Upsert per (source, external_id); ohne external_id wird ein stabiler Schluessel gebildet. */
export async function upsertOffers(env: Env, offers: NormalizedOffer[]): Promise<number> {
  if (!offers.length) return 0;
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  const seenRetailers = new Map<string, { name: string; logo: string | null }>();

  for (const o of offers) {
    seenRetailers.set(o.retailerId, { name: o.retailerName, logo: o.retailerLogoUrl ?? seenRetailers.get(o.retailerId)?.logo ?? null });
    const ext =
      o.externalId ?? `${o.retailerId}|${fold(o.productName)}|${o.priceCents}|${o.validFrom ?? ""}`;
    const pack = parsePack(`${o.productName} ${o.description ?? ""}`);
    const up = unitPriceCents(o.priceCents, pack);
    const search = fold([o.productName, o.brand, o.description].filter(Boolean).join(" "));
    stmts.push(
      env.DB.prepare(
        `INSERT INTO offers (source, external_id, retailer_id, product_name, search_text, brand, description,
           price_cents, old_price_cents, unit_price_cents, unit_price_basis, pack_amount, pack_dimension,
           valid_from, valid_to, image_url, fetched_at, category, discount_pct)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(source, external_id) DO UPDATE SET
           retailer_id=excluded.retailer_id, product_name=excluded.product_name, search_text=excluded.search_text,
           brand=excluded.brand, description=excluded.description, price_cents=excluded.price_cents,
           old_price_cents=excluded.old_price_cents, unit_price_cents=excluded.unit_price_cents,
           unit_price_basis=excluded.unit_price_basis, pack_amount=excluded.pack_amount,
           pack_dimension=excluded.pack_dimension, valid_from=excluded.valid_from, valid_to=excluded.valid_to,
           image_url=excluded.image_url, fetched_at=excluded.fetched_at,
           category=excluded.category, discount_pct=excluded.discount_pct`,
      ).bind(
        o.source, ext, o.retailerId, o.productName, search, o.brand, o.description,
        o.priceCents, o.oldPriceCents, up?.cents ?? null, up?.basis ?? null, pack.amount, pack.dimension,
        o.validFrom, o.validTo, o.imageUrl, now,
        categorize(`${o.productName} ${o.brand ?? ""}`, o.categoryHint), discountPct(o.priceCents, o.oldPriceCents),
      ),
    );
  }
  for (const [id, r] of seenRetailers) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO retailers (id, name, logo_url) VALUES (?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           name = CASE WHEN excluded.name = retailers.id THEN retailers.name ELSE excluded.name END,
           logo_url = COALESCE(excluded.logo_url, retailers.logo_url)`,
      ).bind(id, r.name, r.logo),
    );
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
  o.valid_from, o.valid_to, o.image_url, o.category, o.discount_pct, r.logo_url AS retailer_logo`;

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
export async function candidateOffersBatch(
  env: Env,
  names: string[],
  limit = 80,
  retailers: string[] = [],
): Promise<OfferRow[][]> {
  const today = todayIso();
  const rClause = retailers.length ? ` AND o.retailer_id IN (${retailers.map(() => "?").join(",")})` : "";
  const stmts: D1PreparedStatement[] = names.map((name) => {
    const toks = tokens(name).filter((t) => t.length >= 4).slice(0, 4);
    if (!toks.length) return env.DB.prepare("SELECT 1 WHERE 0");
    const likes = toks.map(() => "o.search_text LIKE ?").join(" OR ");
    return env.DB.prepare(
      `SELECT ${SELECT_COLS} FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id
       WHERE (${likes}) AND ${ACTIVE}${rClause} LIMIT ?`,
    ).bind(...toks.map((t) => `%${t}%`), today, today, ...retailers, limit);
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


// ------------------------------------------------------------------ Browse / Facetten
export interface BrowseParams {
  retailers: string[];
  category?: string;
  q?: string;
  sort: "discount" | "price" | "unit";
  onlyDiscounts?: boolean;
  limit: number;
  offset: number;
}

const ORDER: Record<BrowseParams["sort"], string> = {
  discount: "o.discount_pct IS NULL, o.discount_pct DESC, o.price_cents ASC",
  price: "o.price_cents ASC",
  unit: "o.unit_price_cents IS NULL, o.unit_price_cents ASC, o.price_cents ASC",
};

export async function browseOffers(env: Env, p: BrowseParams) {
  const today = todayIso();
  const base: string[] = [ACTIVE];
  const baseBinds: unknown[] = [today, today];
  for (const t of tokens(p.q ?? "").slice(0, 4)) {
    base.push("o.search_text LIKE ?");
    baseBinds.push(`%${t}%`);
  }
  if (p.onlyDiscounts) base.push("o.discount_pct IS NOT NULL");

  const retailerSql = p.retailers.length ? `o.retailer_id IN (${p.retailers.map(() => "?").join(",")})` : "";
  const catSql = p.category ? "o.category = ?" : "";

  const where = (parts: string[]) => parts.filter(Boolean).join(" AND ");
  const J = "LEFT JOIN retailers r ON r.id = o.retailer_id";

  // Zeilen: alle Filter
  const rowsStmt = env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM offers o ${J} WHERE ${where([...base, retailerSql, catSql])}
     ORDER BY ${ORDER[p.sort]} LIMIT ? OFFSET ?`,
  ).bind(...baseBinds, ...p.retailers, ...(p.category ? [p.category] : []), p.limit, p.offset);

  const totalStmt = env.DB.prepare(
    `SELECT COUNT(*) AS n FROM offers o WHERE ${where([...base, retailerSql, catSql])}`,
  ).bind(...baseBinds, ...p.retailers, ...(p.category ? [p.category] : []));

  // Kategorie-Facette: Maerkte-Filter ja, Kategorie-Filter nein
  const catFacet = env.DB.prepare(
    `SELECT COALESCE(o.category, 'sonstiges') AS id, COUNT(*) AS n FROM offers o WHERE ${where([...base, retailerSql])}
     GROUP BY COALESCE(o.category, 'sonstiges')`,
  ).bind(...baseBinds, ...p.retailers);

  // Maerkte-Facette: Kategorie-Filter ja, Maerkte-Filter nein
  const retFacet = env.DB.prepare(
    `SELECT o.retailer_id AS id, r.name AS name, r.logo_url AS logo, COUNT(*) AS n, MAX(o.discount_pct) AS max_discount
     FROM offers o ${J} WHERE ${where([...base, catSql])} GROUP BY o.retailer_id ORDER BY n DESC`,
  ).bind(...baseBinds, ...(p.category ? [p.category] : []));

  const [rows, total, cats, rets] = await env.DB.batch([rowsStmt, totalStmt, catFacet, retFacet]);
  return {
    offers: (rows.results ?? []) as unknown as OfferRow[],
    total: ((total.results?.[0] as { n: number } | undefined)?.n ?? 0) as number,
    categories: (cats.results ?? []) as { id: string; n: number }[],
    retailers: (rets.results ?? []) as { id: string; name: string | null; logo: string | null; n: number; max_discount: number | null }[],
  };
}

/** Alle Haendler mit aktuell gueltigen Angeboten (fuer die Maerkte-Auswahl). */
export async function listRetailers(env: Env) {
  const today = todayIso();
  const { results } = await env.DB.prepare(
    `SELECT o.retailer_id AS id, r.name AS name, r.logo_url AS logo, COUNT(*) AS n, MAX(o.discount_pct) AS max_discount
     FROM offers o LEFT JOIN retailers r ON r.id = o.retailer_id WHERE ${ACTIVE}
     GROUP BY o.retailer_id ORDER BY n DESC`,
  ).bind(today, today).all();
  return (results ?? []) as { id: string; name: string | null; logo: string | null; n: number; max_discount: number | null }[];
}
