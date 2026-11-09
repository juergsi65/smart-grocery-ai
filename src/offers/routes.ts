import { Hono } from "hono";
import type { AppVars, Env } from "../env";
import { requireSession } from "../session";
import { MAX_TERMS_PER_RUN, SEED_TERMS, refreshOffers } from "./ingest";
import { fold } from "./normalize";
import { CATEGORIES } from "../categories";
import { browseOffers, listRetailers, offerStats, searchOffers, upsertOffers } from "./store";
import type { NormalizedOffer } from "./types";

export const offers = new Hono<{ Bindings: Env; Variables: AppVars }>();
offers.use("*", requireSession);

offers.get("/stats", async (c) => c.json(await offerStats(c.env)));

offers.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  if (q.trim().length < 2) return c.json({ error: "Suchbegriff zu kurz" }, 400);
  return c.json(await searchOffers(c.env, q, c.req.query("retailer") ?? undefined));
});

offers.get("/categories", (c) => c.json(CATEGORIES));

offers.get("/retailers", async (c) => c.json(await listRetailers(c.env)));

/**
 * Angebote stoebern: ?retailers=billa,spar &category=obst-gemuese &q=tomaten &sort=discount|price|unit
 * &discounts=1 (nur mit Rabatt) &limit=24 &offset=0
 * Antwort enthaelt Facetten (Kategorien und Maerkte mit Anzahl) passend zu den aktuellen Filtern.
 */
offers.get("/browse", async (c) => {
  const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 30) : []);
  const sortQ = c.req.query("sort");
  const sort = sortQ === "price" || sortQ === "unit" ? sortQ : "discount";
  const cat = c.req.query("category");
  const limit = Math.min(60, Math.max(1, Number(c.req.query("limit")) || 24));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const q = (c.req.query("q") ?? "").slice(0, 80);
  const res = await browseOffers(c.env, {
    retailers: list(c.req.query("retailers")),
    category: cat && CATEGORIES.some((x) => x.id === cat) ? cat : undefined,
    q: q.trim().length >= 2 ? q : undefined,
    sort,
    onlyDiscounts: c.req.query("discounts") === "1",
    limit,
    offset,
  });
  return c.json({ ...res, limit, offset });
});

/** Live-Refresh (Marktguru). Body: { terms?: string[], zip?: string } - ohne terms: erster Seed-Chunk. */
offers.post("/refresh", async (c) => {
  const body = await c.req.json<{ terms?: string[]; zip?: string; chunk?: number }>().catch(() => ({}) as any);
  let terms: string[];
  if (Array.isArray(body.terms) && body.terms.length) terms = body.terms.filter((t: unknown) => typeof t === "string");
  else {
    const chunk = Number.isInteger(body.chunk) ? Number(body.chunk) : 0;
    const size = Math.ceil(SEED_TERMS.length / 3);
    terms = SEED_TERMS.slice(chunk * size, (chunk + 1) * size);
  }
  const zip = typeof body.zip === "string" && /^\d{4,5}$/.test(body.zip) ? body.zip : undefined;
  const result = await refreshOffers(c.env, terms.slice(0, MAX_TERMS_PER_RUN), { zip });
  return c.json(result, result.offers === 0 && result.firstError ? 502 : 200);
});

/**
 * Manueller Import - verlaesslicher Weg fuer Flugblatt-/Haendler-JSON oder eigene Daten.
 * Body: { offers: [{ retailer, retailerName?, product, brand?, description?, price, oldPrice?, validFrom?, validTo?,
 *   imageUrl? (https), category? (Hinweis), retailerLogo? (https) }] }
 * price/oldPrice in Euro.
 */
offers.post("/import", async (c) => {
  const body = await c.req.json<{ offers?: any[] }>().catch(() => ({}) as any);
  if (!Array.isArray(body.offers) || !body.offers.length) return c.json({ error: "offers[] erforderlich" }, 400);
  if (body.offers.length > 2000) return c.json({ error: "Maximal 2000 Angebote pro Import" }, 400);
  const out: NormalizedOffer[] = [];
  const errors: string[] = [];
  body.offers.forEach((o: any, i: number) => {
    const price = Number(String(o?.price).replace(",", "."));
    if (!o?.retailer || !o?.product || !Number.isFinite(price) || price <= 0) {
      errors.push(`#${i}: retailer, product und price (>0) erforderlich`);
      return;
    }
    const old = o.oldPrice != null ? Number(String(o.oldPrice).replace(",", ".")) : NaN;
    out.push({
      source: "import",
      externalId: o.id != null ? String(o.id) : null,
      retailerId: fold(String(o.retailer)).replace(/\s+/g, "-"),
      retailerName: String(o.retailerName ?? o.retailer),
      productName: String(o.product),
      brand: o.brand ? String(o.brand) : null,
      description: o.description ? String(o.description) : null,
      priceCents: Math.round(price * 100),
      oldPriceCents: Number.isFinite(old) && old > price ? Math.round(old * 100) : null,
      validFrom: typeof o.validFrom === "string" ? o.validFrom.slice(0, 10) : null,
      validTo: typeof o.validTo === "string" ? o.validTo.slice(0, 10) : null,
      imageUrl: typeof o.imageUrl === "string" && /^https:\/\//.test(o.imageUrl) ? o.imageUrl : null,
      categoryHint: typeof o.category === "string" ? o.category : null,
      retailerLogoUrl: typeof o.retailerLogo === "string" && /^https:\/\//.test(o.retailerLogo) ? o.retailerLogo : null,
    });
  });
  const imported = await upsertOffers(c.env, out);
  await c.env.DB.prepare("INSERT INTO ingest_runs (source, started_at, ok, count, message) VALUES (?,?,?,?,?)")
    .bind("import", Date.now(), 1, imported, errors.length ? `${errors.length} Zeilen uebersprungen` : null)
    .run();
  return c.json({ imported, skipped: errors.length, errors: errors.slice(0, 20) });
});
