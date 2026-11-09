import { Hono } from "hono";
import type { Context } from "hono";
import type { AppVars, Env } from "../env";
import { ConfigError, createSession, deleteSession, requireSession, saveCookies } from "../session";
import { aggregate, ingredientFromCookidoo, type CanonicalIngredient } from "./aggregate";
import {
  CookidooAuthError,
  CookidooClient,
  CookidooParseError,
  CookidooRequestError,
  CookieJar,
} from "./client";
import { parseQuantity } from "./quantity";

type C = Context<{ Bindings: Env; Variables: AppVars }>;

export const cookidoo = new Hono<{ Bindings: Env; Variables: AppVars }>();

/** Fuehrt eine Operation mit dem Session-Client aus, persistiert rotierte Cookies, mappt Fehler. */
export async function withClient<T>(c: C, fn: (client: CookidooClient) => Promise<T>): Promise<T> {
  const s = c.var.session;
  const client = new CookidooClient(s.country, CookieJar.fromJSON(s.cookiesJson));
  try {
    return await fn(client);
  } finally {
    // Token-Rotation: aktualisierte Cookies zurueckschreiben (best effort).
    try {
      const after = client.jar.toJSON();
      if (after !== s.cookiesJson) await saveCookies(c.env, s.tokenHash, after);
    } catch {
      /* ignore */
    }
  }
}

export function errorResponse(c: C, e: unknown): Response {
  if (e instanceof CookidooAuthError) return c.json({ error: e.message }, 401);
  if (e instanceof CookidooRequestError || e instanceof CookidooParseError) {
    return c.json({ error: e.message }, 502);
  }
  if (e instanceof ConfigError) return c.json({ error: e.message }, 500);
  console.error("unhandled", e);
  const msg = String((e as Error)?.message ?? e);
  if (/no such table/i.test(msg)) {
    return c.json({ error: "Datenbank nicht eingerichtet: Schema fehlt (npm run db:migrate:remote)" }, 500);
  }
  return c.json({ error: "Interner Fehler" }, 500);
}

const isoDate = (s: string | undefined): string => {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------- Login
cookidoo.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; country?: string }>().catch(() => ({}) as any);
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) return c.json({ error: "E-Mail und Passwort erforderlich" }, 400);
  const country = (body.country ?? c.env.COOKIDOO_COUNTRY ?? "at").toLowerCase();
  try {
    const client = new CookidooClient(country);
    await client.login(email, password);
    const info = await client.getUserInfo();
    const token = await createSession(c.env, {
      cookiesJson: client.jar.toJSON(),
      country,
      username: info.username,
    });
    return c.json({ token, username: info.username, description: info.description });
  } catch (e) {
    return errorResponse(c as C, e);
  }
});

cookidoo.delete("/login", requireSession, async (c) => {
  await deleteSession(c.env, c.var.session.tokenHash);
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- Daten-Routen
cookidoo.get("/me", requireSession, async (c) => {
  try {
    return c.json(await withClient(c, (cl) => cl.getUserInfo()));
  } catch (e) {
    return errorResponse(c, e);
  }
});

cookidoo.get("/week", requireSession, async (c) => {
  try {
    const day = isoDate(c.req.query("date"));
    return c.json(await withClient(c, (cl) => cl.getWeek(day)));
  } catch (e) {
    return errorResponse(c, e);
  }
});

cookidoo.get("/recipes/:id", requireSession, async (c) => {
  try {
    const id = c.req.param("id");
    const d = await withClient(c, (cl) => cl.getRecipe(id));
    return c.json({
      ...d,
      ingredients: d.ingredients.map((i) => ({ name: i.name, quantity: parseQuantity(i.description) })),
    });
  } catch (e) {
    return errorResponse(c, e);
  }
});

/** Rezepte laden und zu einer aggregierten Liste zusammenfuehren. */
export async function combineRecipes(c: C, recipeIds: string[]) {
  const all: CanonicalIngredient[] = [];
  const recipes: { id: string; name: string; totalTime: number | null; url: string }[] = [];
  await withClient(c, async (cl) => {
    for (const rid of recipeIds) {
      const d = await cl.getRecipe(rid);
      recipes.push({ id: d.id, name: d.name, totalTime: d.totalTime, url: d.url });
      for (const i of d.ingredients) all.push(ingredientFromCookidoo(i.name, i.description, d.id, d.name));
    }
  });
  return { recipes, items: aggregate(all), unmergedCount: all.length };
}

cookidoo.post("/combine", requireSession, async (c) => {
  const body = await c.req.json<{ recipeIds?: string[] }>().catch(() => ({}) as any);
  const ids = Array.isArray(body.recipeIds) ? body.recipeIds.filter((x: unknown) => typeof x === "string") : [];
  if (!ids.length) return c.json({ error: "recipeIds erforderlich" }, 400);
  if (ids.length > 30) return c.json({ error: "Maximal 30 Rezepte pro Anfrage" }, 400);
  try {
    return c.json(await combineRecipes(c, ids));
  } catch (e) {
    return errorResponse(c, e);
  }
});

export async function loadShoppingList(c: C) {
  const { ingredients, additional } = await withClient(c, (cl) => cl.getShoppingList());
  const canon = ingredients.filter((i) => !i.isOwned).map((i) => ({ name: i.name, quantity: parseQuantity(i.description) }));
  return {
    items: [
      ...ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        isOwned: i.isOwned,
        quantity: parseQuantity(i.description),
        kind: "ingredient" as const,
      })),
      ...additional.map((i) => ({ id: i.id, name: i.name, isOwned: i.isOwned, quantity: null, kind: "additional" as const })),
    ],
    aggregated: aggregate(canon),
  };
}

cookidoo.get("/shopping-list", requireSession, async (c) => {
  try {
    return c.json(await loadShoppingList(c));
  } catch (e) {
    return errorResponse(c, e);
  }
});

cookidoo.post("/shopping-list/sync", requireSession, async (c) => {
  const body = await c.req.json<{ recipeIds?: string[] }>().catch(() => ({}) as any);
  const ids = Array.isArray(body.recipeIds) ? body.recipeIds.filter((x: unknown) => typeof x === "string") : [];
  if (!ids.length) return c.json({ error: "recipeIds erforderlich" }, 400);
  try {
    await withClient(c, (cl) => cl.addRecipesToShoppingList(ids));
    return c.json(await loadShoppingList(c));
  } catch (e) {
    return errorResponse(c, e);
  }
});
