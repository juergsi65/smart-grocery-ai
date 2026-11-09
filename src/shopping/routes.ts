import { Hono } from "hono";
import type { Context } from "hono";
import { aggregate, ingredientFromCookidoo, normalizeName, type CanonicalIngredient } from "../cookidoo/aggregate";
import { combineRecipes, errorResponse, withClient } from "../cookidoo/routes";
import { parseQuantity } from "../cookidoo/quantity";
import type { AppVars, Env } from "../env";
import { requireSession } from "../session";
import { toNeed } from "./needs";
import { AddItemSchema, ImportSchema, PatchItemSchema, splitQuantity } from "./schemas";
import { deleteItem, listItems, patchItem, upsertItems, type UpsertItem } from "./store";

type C = Context<{ Bindings: Env; Variables: AppVars }>;

export const shopping = new Hono<{ Bindings: Env; Variables: AppVars }>();
shopping.use("*", requireSession);

/** Daten gehoeren dem Cookidoo-Benutzer; ohne Benutzername dem Session-Hash. */
export const ownerOf = (c: C): string => c.var.session.username ?? `session:${c.var.session.tokenHash}`;

const summary = (items: { is_bought: boolean; in_pantry: boolean }[]) => ({
  open: items.filter((i) => !i.is_bought && !i.in_pantry).length,
  done: items.filter((i) => i.is_bought || i.in_pantry).length,
});

shopping.get("/", async (c) => {
  const items = await listItems(c.env, ownerOf(c));
  return c.json({ items, counts: summary(items) });
});

shopping.post("/items", async (c) => {
  const p = AddItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "name erforderlich (max. 120 Zeichen)" }, 400);
  const q = p.data.description ? { name: p.data.name, description: p.data.description } : splitQuantity(p.data.name);
  const ing = ingredientFromCookidoo(q.name, q.description);
  const [agg] = aggregate([ing]);
  await upsertItems(c.env, ownerOf(c), [{ need: toNeed(agg), source: "manual" }]);
  const items = await listItems(c.env, ownerOf(c));
  return c.json({ items, counts: summary(items) }, 201);
});

shopping.patch("/items/:id", async (c) => {
  const p = PatchItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Ungueltige Anfrage" }, 400);
  const item = await patchItem(c.env, ownerOf(c), c.req.param("id"), p.data);
  return item ? c.json(item) : c.json({ error: "Eintrag nicht gefunden" }, 404);
});

shopping.delete("/items/:id", async (c) =>
  (await deleteItem(c.env, ownerOf(c), c.req.param("id"))) ? c.json({ ok: true }) : c.json({ error: "Eintrag nicht gefunden" }, 404),
);

/**
 * Import in die persistente Liste.
 *  - { source: "cookidoo-list" }: Cookidoo-Einkaufsliste; abgehakte Zutaten (isOwned) -> is_bought = true.
 *  - { source: "recipes", recipeIds }: Zutaten der Rezepte zusammengefuehrt hinzufuegen.
 * Bestehende Eintraege behalten ihre lokalen Flags.
 */
shopping.post("/import", async (c) => {
  const p = ImportSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "source ('cookidoo-list' | 'recipes') und ggf. recipeIds erforderlich" }, 400);
  try {
    const owner = ownerOf(c);
    let list: UpsertItem[];
    if (p.data.source === "recipes") {
      const combined = await combineRecipes(c, p.data.recipeIds);
      list = combined.items.map((a) => ({ need: toNeed(a), source: "recipes" as const }));
    } else {
      const { ingredients, additional } = await withClient(c, (cl) => cl.getShoppingList());
      list = mapCookidooList(ingredients, additional);
    }
    await upsertItems(c.env, owner, list);
    const items = await listItems(c.env, owner);
    return c.json({ imported: list.length, items, counts: summary(items) });
  } catch (e) {
    return errorResponse(c, e);
  }
});

/** Cookidoo-Payload -> Listeneintraege. Eine Zutat gilt als gekauft, wenn ALLE Cookidoo-Zeilen dazu abgehakt sind. */
export function mapCookidooList(
  ingredients: { name: string; description?: string | null; isOwned: boolean }[],
  additional: { name: string; isOwned: boolean }[],
): UpsertItem[] {
  const groups = new Map<string, { canon: CanonicalIngredient[]; allOwned: boolean }>();
  const add = (name: string, desc: string | null | undefined, owned: boolean) => {
    const key = normalizeName(name);
    if (!key) return;
    const g = groups.get(key) ?? { canon: [], allOwned: true };
    g.canon.push({ name: name.trim(), quantity: parseQuantity(desc) });
    g.allOwned &&= owned;
    groups.set(key, g);
  };
  for (const i of ingredients) add(i.name, i.description, i.isOwned);
  for (const i of additional) add(i.name, null, i.isOwned);
  return [...groups.values()].map((g) => ({ need: toNeed(aggregate(g.canon)[0]), source: "cookidoo" as const, isBought: g.allOwned }));
}
