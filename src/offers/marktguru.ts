/**
 * Marktguru-Adapter (inoffizielle API, Stand: Struktur der Library `marktguru` 0.0.6,
 * dort fuer marktguru.de; fuer Oesterreich analog marktguru.at). NICHT gegen die
 * Live-API verifiziert -> Fehler werden sauber gemeldet, der JSON-Import bleibt der
 * verlaessliche Weg.
 *
 * Ablauf: API-/Client-Key stehen als JSON in einem <script type="application/json">
 * der Startseite; damit GET {api}/offers/search?as=web&q=...&zipCode=...
 *
 * Robustheit: Retry bei 429/5xx, veraltete Keys als Fallback, jedes Einzelangebot wird separat
 * geparst und validiert (ein kaputtes Angebot bricht nie den Lauf ab). Die zuletzt gespeicherten
 * Angebote in D1 dienen als Fallback-Cache, solange kein erfolgreicher Lauf neue liefert.
 * Nur Lebensmittelhaendler in AT und keine Nicht-Lebensmittel-Kategorien (siehe food.ts).
 */
import { isFoodRetailer, isNonFoodCategory } from "./food";
import { NormalizedOfferSchema } from "./schema";
import type { NormalizedOffer, OfferSource, SourceStats } from "./types";

const SITE = "https://www.marktguru.at";
const API = "https://api.marktguru.at/api/v1";
const UA = "Mozilla/5.0 (compatible; smart-grocery-ai/0.3)";

interface Keys {
  apiKey: string;
  clientKey: string;
}

let keyCache: { keys: Keys; at: number } | null = null;
const KEY_TTL = 6 * 3600 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch mit bis zu 2 Wiederholungen bei 429/5xx bzw. Netzwerkfehlern. */
async function fetchRetry(url: string | URL, init: RequestInit = {}): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      last = new Error(`Status ${res.status}`);
      const ra = Number(res.headers.get("Retry-After"));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 2) * 1000 : 400 * (attempt + 1));
    } catch (e) {
      last = e;
      await sleep(400 * (attempt + 1));
    }
  }
  throw new Error(`marktguru nicht erreichbar (${(last as Error)?.message ?? last})`);
}

async function getKeys(): Promise<Keys> {
  if (keyCache && Date.now() - keyCache.at < KEY_TTL) return keyCache.keys;
  try {
    const res = await fetchRetry(SITE, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`marktguru Startseite: Status ${res.status}`);
    const html = await res.text();
    const re = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    let found: Keys | null = null;
    while ((m = re.exec(html)) !== null) {
      try {
        const j = JSON.parse(m[1]);
        if (j?.config?.apiKey && j?.config?.clientKey) found = { apiKey: j.config.apiKey, clientKey: j.config.clientKey };
      } catch {
        /* naechster Block */
      }
    }
    if (!found) throw new Error("marktguru: API-Keys auf der Startseite nicht gefunden (Seitenstruktur geaendert?)");
    keyCache = { keys: found, at: Date.now() };
    return found;
  } catch (e) {
    if (keyCache) return keyCache.keys; // veraltete Keys sind besser als gar keine
    throw e;
  }
}

const dateOnly = (s: unknown): string | null => (typeof s === "string" && s.length >= 10 ? s.slice(0, 10) : null);

/** Rohdaten -> validierte, nur Lebensmittel-Angebote. Rein funktional (testbar). */
export function parseMarktguruResults(results: unknown, stats?: SourceStats): NormalizedOffer[] {
  const out: NormalizedOffer[] = [];
  if (!Array.isArray(results)) return out;
  for (const o of results as any[]) {
    try {
      const adv = o?.advertisers?.[0];
      if (!isFoodRetailer(adv?.uniqueName, adv?.name)) {
        if (stats) stats.filtered++;
        continue;
      }
      const cat = o?.categories?.[0]?.name;
      if (isNonFoodCategory(cat)) {
        if (stats) stats.filtered++;
        continue;
      }
      const v = o?.validityDates?.[0];
      // Packungsgroesse steht meist in description ("500 g", "6 x 0,33 l"); unit.shortName als Zusatz.
      const desc = [o?.description, o?.unit?.shortName && o.unit.shortName !== "Stk" ? o.unit.shortName : null]
        .filter(Boolean)
        .join(" ");
      const parsed = NormalizedOfferSchema.safeParse({
        source: "marktguru",
        externalId: o?.id != null ? String(o.id) : null,
        retailerId: String(adv.uniqueName ?? adv.name).toLowerCase(),
        retailerName: String(adv.name ?? adv.uniqueName),
        productName: o?.product?.name != null ? String(o.product.name) : "",
        brand: o?.brand?.name ?? null,
        description: desc || null,
        priceCents: typeof o?.price === "number" ? Math.round(o.price * 100) : NaN,
        oldPriceCents: typeof o?.oldPrice === "number" ? Math.round(o.oldPrice * 100) : null,
        validFrom: dateOnly(v?.from),
        validTo: dateOnly(v?.to),
        // Bild-/Logo-URL-Schema aus der Library `marktguru` (CDN dort fuer .de); unverifiziert fuer .at.
        // Das Frontend faellt bei Ladefehlern auf Kategorie-Icon bzw. Haendler-Initialen zurueck.
        imageUrl: o?.id != null ? `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/medium.jpg` : null,
        categoryHint: cat ?? null,
        retailerLogoUrl: adv?.id != null ? `https://mg2de.b-cdn.net/api/v1/${adv.id}/images/logos/0/small.png` : null,
      });
      if (parsed.success) out.push(parsed.data as NormalizedOffer);
      else if (stats) stats.invalid++;
    } catch {
      if (stats) stats.invalid++;
    }
  }
  return out;
}

export const marktguru: OfferSource = {
  id: "marktguru",
  async search(term, { zip, limit = 30, stats }) {
    const keys = await getKeys();
    const url = new URL(`${API}/offers/search`);
    url.search = new URLSearchParams({ as: "web", q: term, limit: String(limit), offset: "0", zipCode: zip }).toString();
    const res = await fetchRetry(url, { headers: { "x-apikey": keys.apiKey, "x-clientkey": keys.clientKey, "User-Agent": UA } });
    if (res.status === 401 || res.status === 403) keyCache = null;
    if (!res.ok) throw new Error(`marktguru Suche '${term}': Status ${res.status}`);
    let data: { results?: unknown };
    try {
      data = (await res.json()) as { results?: unknown };
    } catch {
      throw new Error(`marktguru Suche '${term}': Antwort ist kein gueltiges JSON`);
    }
    return parseMarktguruResults(data?.results, stats);
  },
};
