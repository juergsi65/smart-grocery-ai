import { Hono } from "hono";
import type { AppVars, Env } from "../env";
import { requireSession } from "../session";
import { BasePriceInput, deleteBasePrice, listBasePrices, putManualPrice } from "./store";
import { FOOD_RETAILERS } from "./retailers";

/** Normalpreise (Regalpreise) einsehen und selbst korrigieren. Manuelle Eintraege werden nie von gelernten ueberschrieben. */
export const prices = new Hono<{ Bindings: Env; Variables: AppVars }>();
prices.use("*", requireSession);

prices.get("/retailers", (c) => c.json(FOOD_RETAILERS));

prices.get("/base", async (c) =>
  c.json(await listBasePrices(c.env, c.req.query("q") ?? undefined, c.req.query("retailer") ?? undefined, Math.min(200, Number(c.req.query("limit")) || 100))),
);

prices.put("/base", async (c) => {
  const p = BasePriceInput.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "retailer, product und price (Euro, > 0) erforderlich" }, 400);
  await putManualPrice(c.env, p.data);
  return c.json({ ok: true }, 201);
});

prices.delete("/base/:id", async (c) =>
  (await deleteBasePrice(c.env, Number(c.req.param("id")))) ? c.json({ ok: true }) : c.json({ error: "Nicht gefunden" }, 404),
);
