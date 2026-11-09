import { categorize } from "../categories";
import type { Need, PackDim } from "../optimizer";
import type { Env } from "../env";
import type { ShoppingListItem } from "./schemas";

interface Row {
  id: string; owner: string; key: string; name: string; display: string; category: string;
  amount: number | null; dimension: string | null; source: string;
  is_bought: number; in_pantry: number; created_at: number; updated_at: number;
}

const toItem = (r: Row): ShoppingListItem => ({
  id: r.id, name: r.name, display: r.display, category: r.category,
  source: r.source as ShoppingListItem["source"],
  is_bought: !!r.is_bought, in_pantry: !!r.in_pantry, updated_at: r.updated_at,
});

export async function listItems(env: Env, owner: string): Promise<ShoppingListItem[]> {
  const { results } = await env.DB.prepare("SELECT * FROM shopping_items WHERE owner = ? ORDER BY created_at, name")
    .bind(owner)
    .all<Row>();
  return (results ?? []).map(toItem);
}

export interface UpsertItem {
  need: Need;
  source: "manual" | "cookidoo" | "recipes";
  /** Von der Quelle als erledigt gemeldet (Cookidoo: abgehakt). true setzt, false laesst den lokalen Stand unveraendert. */
  isBought?: boolean;
}

/** Fuegt Eintraege ein bzw. aktualisiert Name/Menge. Lokale Flags gehen nie verloren; `isBought: true` setzt sie. */
export async function upsertItems(env: Env, owner: string, items: UpsertItem[]): Promise<number> {
  if (!items.length) return 0;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO shopping_items (id, owner, key, name, display, category, amount, dimension, source, is_bought, in_pantry, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)
     ON CONFLICT(owner, key) DO UPDATE SET
       name = excluded.name, display = excluded.display, category = excluded.category,
       amount = excluded.amount, dimension = excluded.dimension,
       is_bought = CASE WHEN excluded.is_bought = 1 THEN 1 ELSE shopping_items.is_bought END,
       updated_at = excluded.updated_at`,
  );
  const stmts = items.map(({ need: n, source, isBought }) =>
    stmt.bind(crypto.randomUUID(), owner, n.key, n.name, n.display, n.category || categorize(n.name), n.amount, n.dimension, source, isBought ? 1 : 0, now, now),
  );
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return items.length;
}

export async function patchItem(
  env: Env, owner: string, id: string, patch: { is_bought?: boolean; in_pantry?: boolean },
): Promise<ShoppingListItem | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.is_bought !== undefined) { sets.push("is_bought = ?"); binds.push(patch.is_bought ? 1 : 0); }
  if (patch.in_pantry !== undefined) { sets.push("in_pantry = ?"); binds.push(patch.in_pantry ? 1 : 0); }
  const row = await env.DB.prepare(`UPDATE shopping_items SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND owner = ? RETURNING *`)
    .bind(...binds, Date.now(), id, owner)
    .first<Row>();
  return row ? toItem(row) : null;
}

export async function deleteItem(env: Env, owner: string, id: string): Promise<boolean> {
  const r = await env.DB.prepare("DELETE FROM shopping_items WHERE id = ? AND owner = ?").bind(id, owner).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Offene Eintraege als Optimizer-Bedarf. Gekaufte und vorhandene Zutaten werden vollstaendig uebersprungen. */
export async function activeNeeds(env: Env, owner: string): Promise<{ needs: Need[]; skipped: number }> {
  const { results } = await env.DB.prepare("SELECT * FROM shopping_items WHERE owner = ? ORDER BY created_at, name")
    .bind(owner)
    .all<Row>();
  const rows = results ?? [];
  const open = rows.filter((r) => !r.is_bought && !r.in_pantry);
  return {
    skipped: rows.length - open.length,
    needs: open.map((r) => ({
      key: r.key, name: r.name, display: r.display, category: r.category,
      amount: r.amount, dimension: (r.dimension as PackDim | null) ?? null,
    })),
  };
}
