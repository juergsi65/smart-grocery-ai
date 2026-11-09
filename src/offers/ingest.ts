/**
 * Angebots-Ingestion. Die Marktguru-API bietet nur Suche (kein "alles auflisten"), daher
 * wird eine Liste gaengiger Einkaufsbegriffe abgefragt. Workers Free erlaubt ~50 Subrequests
 * pro Aufruf -> max. 40 Suchbegriffe je Lauf; der Cron laeuft in 3 Chunks.
 */
import type { Env } from "../env";
import { marktguru } from "./marktguru";
import { deleteExpired, upsertOffers } from "./store";
import type { NormalizedOffer, OfferSource } from "./types";

export const MAX_TERMS_PER_RUN = 40;

export const SEED_TERMS: string[] = [
  // Gemuese / Obst
  "tomaten", "gurke", "paprika", "zwiebel", "knoblauch", "karotten", "kartoffeln", "zucchini", "melanzani",
  "brokkoli", "karfiol", "spinat", "salat", "champignons", "lauch", "sellerie", "kuerbis", "pilze", "avocado",
  "zitrone", "apfel", "banane", "birnen", "orangen", "trauben", "beeren", "ingwer", "petersilie", "basilikum",
  // Milch / Eier / Kaese
  "milch", "obers", "sauerrahm", "joghurt", "butter", "eier", "mozzarella", "parmesan", "gouda", "feta",
  "topfen", "creme fraiche", "frischkaese",
  // Fleisch / Fisch
  "haehnchen", "huhn", "faschiertes", "schweinefleisch", "rindfleisch", "schinken", "speck", "wurst", "lachs",
  "thunfisch", "garnelen", "putenfleisch",
  // Trockenware / Basics
  "nudeln", "spaghetti", "reis", "mehl", "zucker", "salz", "olivenoel", "sonnenblumenoel", "essig", "tomatensauce",
  "passierte tomaten", "kokosmilch", "linsen", "kichererbsen", "bohnen", "mais", "haferflocken", "brot", "toast",
  "semmeln", "tortilla", "couscous", "polenta", "senf", "ketchup", "mayonnaise", "sojasauce", "gewuerze",
  "backpulver", "germ", "schokolade", "nuesse", "mandeln", "honig", "marmelade", "kaffee", "tee",
  // Getraenke / TK
  "mineralwasser", "orangensaft", "wein", "bier", "tiefkuehl gemuese", "tiefkuehl pizza", "eis",
];

export function chunkOf(index: number, total = 3): string[] {
  const size = Math.ceil(SEED_TERMS.length / total);
  return SEED_TERMS.slice(index * size, (index + 1) * size).slice(0, MAX_TERMS_PER_RUN);
}

export interface RefreshResult {
  source: string;
  termsTried: number;
  termsFailed: number;
  offers: number;
  firstError?: string;
}

export async function refreshOffers(
  env: Env,
  terms: string[],
  opts: { zip?: string; source?: OfferSource } = {},
): Promise<RefreshResult> {
  const source = opts.source ?? marktguru;
  const zip = opts.zip ?? env.OFFERS_ZIP ?? "4600";
  const list = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TERMS_PER_RUN);
  const started = Date.now();
  const collected = new Map<string, NormalizedOffer>();
  let failed = 0;
  let firstError: string | undefined;

  // Sequenziell in kleinen Gruppen, um die Quelle nicht zu fluten.
  for (let i = 0; i < list.length; i += 4) {
    const group = list.slice(i, i + 4);
    const settled = await Promise.allSettled(group.map((t) => source.search(t, { zip })));
    settled.forEach((r) => {
      if (r.status === "fulfilled") {
        for (const o of r.value) collected.set(`${o.source}|${o.externalId ?? o.retailerId + o.productName + o.priceCents}`, o);
      } else {
        failed++;
        firstError ??= String(r.reason?.message ?? r.reason);
      }
    });
    // Wenn die ersten Gruppen komplett scheitern (Keys/Seitenstruktur), nicht weiter hammern.
    if (failed >= 8 && collected.size === 0) break;
  }

  const offers = [...collected.values()];
  const count = await upsertOffers(env, offers);
  await deleteExpired(env);
  const ok = failed < list.length || list.length === 0;
  await env.DB.prepare("INSERT INTO ingest_runs (source, started_at, ok, count, message) VALUES (?,?,?,?,?)")
    .bind(source.id, started, ok ? 1 : 0, count, firstError ?? null)
    .run();
  return { source: source.id, termsTried: list.length, termsFailed: failed, offers: count, firstError };
}
