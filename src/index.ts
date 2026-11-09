import { Hono } from "hono";
import { cors } from "hono/cors";
import { cookidoo } from "./cookidoo/routes";
import type { AppVars, Env } from "./env";
import { chunkOf, refreshOffers } from "./offers/ingest";
import { offers } from "./offers/routes";
import { optimizeRoutes } from "./optimize-routes";
import { purgeExpiredSessions } from "./session";

const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

app.use("/api/*", cors({ origin: (o) => o, allowHeaders: ["Authorization", "Content-Type", "X-Session"], maxAge: 600 }));

app.get("/api/health", (c) => c.json({ status: "ok", version: "0.2.0" }));
app.route("/api/cookidoo", cookidoo);
app.route("/api/offers", offers);
app.route("/api/optimize", optimizeRoutes);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Nicht gefunden" }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "Interner Fehler" }, 500);
});

export default {
  fetch: app.fetch,

  /** Cron: 04:30 / 04:35 / 04:40 UTC -> Seed-Chunk 0 / 1 / 2. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const chunk = minute >= 40 ? 2 : minute >= 35 ? 1 : 0;
    ctx.waitUntil(
      (async () => {
        await refreshOffers(env, chunkOf(chunk));
        if (chunk === 0) await purgeExpiredSessions(env);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
