import { Hono } from "hono";
import type { AppVars, Env } from "../env";
import { requireSession } from "../session";
import { MAX_TERMS_PER_RUN, SEED_TERMS, refreshOffers } from "./ingest";
import { fold } from "./normalize";
import { offerStats, searchOffers, upsertOffers } from "./store";
import type { NormalizedOffer } from "./types";

export const offers = new Hono<{ Bindings: Env; Variables: AppVars }>();
offers.use("*", requireSession);

offers.get("/stats", async (c) => c.json(await offerStats(c.env)));

offers.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  if (q.trim().length < 2) return c.json({ error: "Suchbegriff zu kurz" }, 400);
  return c.json(await searchOffers(c.env, q, c.req.query("retailer") ?? undefined));
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
 * Body: { offers: [{ retailer, retailerName?, product, brand?, description?, price, oldPrice?, validFrom?, validTo? }] }
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
      imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : null,
    });
  });
  const imported = await upsertOffers(c.env, out);
  await c.env.DB.prepare("INSERT INTO ingest_runs (source, started_at, ok, count, message) VALUES (?,?,?,?,?)")
    .bind("import", Date.now(), 1, imported, errors.length ? `${errors.length} Zeilen uebersprungen` : null)
    .run();
  return c.json({ imported, skipped: errors.length, errors: errors.slice(0, 20) });
});
