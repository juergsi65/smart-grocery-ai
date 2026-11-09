/**
 * KI-Entscheidung fuer mehrdeutige Kandidaten via Cloudflare Workers AI (Free-Tier).
 * Mehrere Zutaten pro Aufruf (Batching) + D1-Cache -> wenige Neuronen/Subrequests.
 */
import type { Env } from "../env";
import { sha256Hex } from "../session";
import type { OfferRow } from "../offers/types";

export interface AiTask {
  key: string; // normalisierter Zutatenname (Cache-Schluessel)
  name: string; // Anzeigename der Zutat
  candidates: OfferRow[]; // <= 8
}

const BATCH = 6;

const SYSTEM = `Du ordnest Rezeptzutaten Supermarkt-Angeboten zu (Oesterreich).
Fuer jede Zutat bekommst du nummerierte Kandidaten. Waehle ALLE Kandidaten, die man als genau diese Zutat
im Rezept einkaufen koennte (gleiche Sorte/Art; Marke egal; Bio, Packungsgroesse und Verarbeitungsgrad wie "frisch" vs "tiefgekuehlt" egal,
solange es dieselbe Zutat ist). Verarbeitete Produkte, die nur die Zutat enthalten (Ketchup fuer Tomaten, Pizza fuer Mozzarella,
Saft fuer Orangen) sind KEIN Treffer. Wenn nichts passt, gib eine leere Liste zurueck.
Antworte ausschliesslich als JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          accept: { type: "array", items: { type: "integer" } },
        },
        required: ["i", "accept"],
      },
    },
  },
  required: ["results"],
};

export async function fingerprint(candidates: OfferRow[]): Promise<string> {
  return sha256Hex(candidates.map((c) => c.id).sort((a, b) => a - b).join(","));
}

function parseJson(raw: unknown): any {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Liefert key -> akzeptierte Offer-IDs. Bei KI-Fehlern: Eintraege fehlen (Aufrufer nutzt dann nur lexikalische Treffer). */
export async function aiAccept(env: Env, tasks: AiTask[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!tasks.length) return out;

  // 1) Cache
  const fps = await Promise.all(tasks.map((t) => fingerprint(t.candidates)));
  const cacheStmts = tasks.map((t, i) =>
    env.DB.prepare("SELECT accepted_ids FROM match_cache WHERE ingredient_key = ? AND offers_fingerprint = ?").bind(t.key, fps[i]),
  );
  const cached = await env.DB.batch<{ accepted_ids: string }>(cacheStmts);
  const open: { task: AiTask; fp: string }[] = [];
  tasks.forEach((t, i) => {
    const row = cached[i].results?.[0];
    if (row) {
      try {
        out.set(t.key, JSON.parse(row.accepted_ids) as number[]);
        return;
      } catch {
        /* neu berechnen */
      }
    }
    open.push({ task: t, fp: fps[i] });
  });

  // 2) KI in Batches
  const writes: D1PreparedStatement[] = [];
  for (let b = 0; b < open.length; b += BATCH) {
    const group = open.slice(b, b + BATCH);
    const prompt = group
      .map(({ task }, gi) => {
        const lines = task.candidates.map(
          (c, ci) => `  ${ci}: ${c.product_name}${c.brand ? ` (${c.brand})` : ""}${c.description ? ` - ${c.description}` : ""}`,
        );
        return `Zutat ${gi}: ${task.name}\n${lines.join("\n")}`;
      })
      .join("\n\n");
    try {
      const res: any = await (env.AI as any).run(env.AI_MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${prompt}\n\nGib {"results":[{"i":<Zutat-Nr>,"accept":[<Kandidaten-Nr>...]}]} zurueck.` },
        ],
        max_tokens: 400,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: SCHEMA },
      });
      const parsed = parseJson(res?.response ?? res);
      const results: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
      for (const r of results) {
        const gi = Number(r?.i);
        const item = group[gi];
        if (!item || !Array.isArray(r.accept)) continue;
        const ids = r.accept
          .map((n: unknown) => item.task.candidates[Number(n)]?.id)
          .filter((x: unknown): x is number => typeof x === "number");
        out.set(item.task.key, ids);
        writes.push(
          env.DB.prepare(
            "INSERT OR REPLACE INTO match_cache (ingredient_key, offers_fingerprint, accepted_ids, created_at) VALUES (?,?,?,?)",
          ).bind(item.task.key, item.fp, JSON.stringify(ids), Date.now()),
        );
      }
    } catch (e) {
      console.warn("Workers AI fehlgeschlagen:", (e as Error).message);
      // Kein Cache-Eintrag -> beim naechsten Mal erneut versuchen.
    }
  }
  if (writes.length) await env.DB.batch(writes);
  return out;
}
