import { Hono } from "hono";
import {
  aggregate,
  ingredientFromCookidoo,
  normalizeName,
  type AggregatedIngredient,
  type CanonicalIngredient,
} from "./cookidoo/aggregate";
import { combineRecipes, errorResponse, loadShoppingList } from "./cookidoo/routes";
import type { AppVars, Env } from "./env";
import { resolvePrices } from "./pricing/resolver";
import { MAX_TERMS_PER_RUN, refreshOffers } from "./offers/ingest";
import { candidateOffersBatch } from "./offers/store";
import { buildOptions, planAll, retailerComparison, stopInsight, type Need } from "./optimizer";
import { requireSession } from "./session";
import { toNeed } from "./shopping/needs";
import { ownerOf } from "./shopping/routes";
import { activeNeeds } from "./shopping/store";

export const optimizeRoutes = new Hono<{ Bindings: Env; Variables: AppVars }>();
optimizeRoutes.use("*", requireSession);

export { toNeed };

// ------------------------------------------------------------------ Einstellungen
optimizeRoutes.get("/settings", async (c) => {
  const u = c.var.session.username;
  const row = u
    ? await c.env.DB.prepare("SELECT zip, max_stores, preferred_retailers, excluded_retailers FROM settings WHERE username = ?")
        .bind(u)
        .first<{ zip: string | null; max_stores: number; preferred_retailers: string | null; excluded_retailers: string | null }>()
    : null;
  return c.json({
    zip: row?.zip ?? c.env.OFFERS_ZIP,
    maxStores: row?.max_stores ?? 2,
    preferredRetailers: row?.preferred_retailers ? JSON.parse(row.preferred_retailers) : [],
    excludedRetailers: row?.excluded_retailers ? JSON.parse(row.excluded_retailers) : [],
  });
});

optimizeRoutes.put("/settings", async (c) => {
  const u = c.var.session.username;
  if (!u) return c.json({ error: "Kein Benutzer in der Session" }, 400);
  const b = await c.req.json<any>().catch(() => ({}));
  const zip = typeof b.zip === "string" && /^\d{4,5}$/.test(b.zip) ? b.zip : null;
  const maxStores = Number.isInteger(b.maxStores) ? Math.min(5, Math.max(1, b.maxStores)) : 2;
  const list = (x: unknown): string => JSON.stringify(Array.isArray(x) ? x.filter((s) => typeof s === "string").slice(0, 30) : []);
  await c.env.DB.prepare(
    `INSERT INTO settings (username, zip, max_stores, preferred_retailers, excluded_retailers) VALUES (?,?,?,?,?)
     ON CONFLICT(username) DO UPDATE SET zip=excluded.zip, max_stores=excluded.max_stores,
       preferred_retailers=excluded.preferred_retailers, excluded_retailers=excluded.excluded_retailers`,
  )
    .bind(u, zip, maxStores, list(b.preferredRetailers), list(b.excludedRetailers))
    .run();
  return c.json({ ok: true });
});

// ----------------------------------------------------------------------- Optimize
/**
 * POST /api/optimize  { recipeIds?: string[], source?: "recipes" | "shopping-list" | "manual", items?: [...], live?: boolean, useAi?: boolean }
 * 1. Zutatenliste aus Rezepten (kombiniert) oder der Cookidoo-Einkaufsliste
 * 2. fehlende Angebote bei Bedarf live nachladen (max. MAX_TERMS_PER_RUN Begriffe)
 * 3. Matching (lexikalisch + Workers AI), 4. Strategien berechnen
 */
optimizeRoutes.post("/", async (c) => {
  const body = await c.req.json<{ recipeIds?: string[]; source?: string; items?: unknown[]; live?: boolean; useAi?: boolean; retailers?: unknown }>().catch(() => ({}) as any);
  try {
    let aggregated: AggregatedIngredient[] = [];
    let recipes: unknown[] = [];
    let needs: Need[] = [];
    let skippedDone = 0;
    if (body.source === "list") {
      // Gespeicherte Einkaufsliste: gekaufte / vorhandene Zutaten werden komplett uebersprungen.
      const r = await activeNeeds(c.env, ownerOf(c));
      needs = r.needs;
      skippedDone = r.skipped;
      if (!needs.length) return c.json({ error: "Keine offenen Zutaten in der Einkaufsliste" }, 400);
    } else if (body.source === "manual") {
      // Freie Liste: [{ name, description? }] oder Strings wie "Tomaten" / "500 g Mehl" (Name = ganzer String).
      const raw = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
      const list = raw
        .map((it: unknown) =>
          typeof it === "string"
            ? ingredientFromCookidoo(it, "")
            : it && typeof (it as any).name === "string"
              ? ingredientFromCookidoo((it as any).name, (it as any).description ?? "")
              : null,
        )
        .filter((x: unknown): x is CanonicalIngredient => x !== null && (x as CanonicalIngredient).name.length > 0);
      if (!list.length) return c.json({ error: "items[] erforderlich" }, 400);
      aggregated = aggregate(list);
    } else if (body.source === "shopping-list") {
      const list = await loadShoppingList(c);
      aggregated = list.aggregated;
    } else {
      const ids = Array.isArray(body.recipeIds) ? body.recipeIds.filter((x: unknown) => typeof x === "string") : [];
      if (!ids.length) return c.json({ error: "recipeIds erforderlich (oder source: 'shopping-list')" }, 400);
      if (ids.length > 30) return c.json({ error: "Maximal 30 Rezepte pro Anfrage" }, 400);
      const combined = await combineRecipes(c, ids);
      aggregated = combined.items;
      recipes = combined.recipes;
    }

    if (body.source !== "list") needs = aggregated.map(toNeed);
    if (!needs.length) return c.json({ error: "Keine Zutaten gefunden" }, 400);

    // Live nachladen: nur Zutaten ohne jeden Kandidaten, begrenzt.
    let refresh: unknown = null;
    if (body.live !== false) {
      const cands = await candidateOffersBatch(c.env, needs.map((n) => n.name), 1);
      const missing = needs.filter((_, i) => cands[i].length === 0).map((n) => n.name);
      if (missing.length) {
        const zipRow = c.var.session.username
          ? await c.env.DB.prepare("SELECT zip FROM settings WHERE username = ?").bind(c.var.session.username).first<{ zip: string | null }>()
          : null;
        try {
          refresh = await refreshOffers(c.env, missing.slice(0, MAX_TERMS_PER_RUN), { zip: zipRow?.zip ?? undefined });
        } catch (e) {
          refresh = { error: (e as Error).message };
        }
      }
    }

    // Selektion der Maerkte (pro Einkauf) hat Vorrang vor gespeicherten Einstellungen.
    const selected = Array.isArray(body.retailers)
      ? body.retailers.filter((x: unknown): x is string => typeof x === "string").map((x: string) => x.toLowerCase()).slice(0, 30)
      : [];
    // Preisfindung: Aktionen (Stufe 1) + Normalpreise/Richtwerte (Stufe 2) fuer jeden verglichenen Markt.
    const { byKey, stats, retailerIds, matching: m } = await resolvePrices(c.env, needs, { retailers: selected, useAi: body.useAi !== false });
    const options = buildOptions(needs, byKey);

    const s = c.var.session.username
      ? await c.env.DB.prepare("SELECT max_stores, preferred_retailers, excluded_retailers FROM settings WHERE username = ?")
          .bind(c.var.session.username)
          .first<{ max_stores: number; preferred_retailers: string | null; excluded_retailers: string | null }>()
      : null;
    const prefs = {
      allowed: selected.length ? new Set<string>(selected) : s?.preferred_retailers ? new Set<string>(JSON.parse(s.preferred_retailers)) : null,
      excluded: s?.excluded_retailers ? new Set<string>(JSON.parse(s.excluded_retailers)) : null,
    };
    const STOP_COST = 300; // Annahme: jeder zusaetzliche Markt kostet ca. 3 EUR an Fahrt/Zeit
    const plans = planAll(needs, options, {
      ...prefs,
      maxStores: Math.min(s?.max_stores ?? 2, selected.length || 5),
      stopPenaltyCents: STOP_COST,
      savingsWeight: 0,
    });
    const comparison = retailerComparison(needs, options, prefs);
    const insight = stopInsight(plans[0], plans.find((p) => p.strategy === "two-stops")!, STOP_COST);
    const matching = { ...m, priceStats: stats, retailers: retailerIds.length };

    return c.json({ recipes, ingredientCount: needs.length, skippedDone, matching, refresh, plans, comparison, insight });
  } catch (e) {
    return errorResponse(c, e);
  }
});
