/**
 * Marktguru-Adapter (inoffizielle API, Stand: Struktur der Library `marktguru` 0.0.6,
 * dort fuer marktguru.de; fuer Oesterreich analog marktguru.at). NICHT gegen die
 * Live-API verifiziert -> Fehler werden sauber gemeldet, der JSON-Import bleibt der
 * verlaessliche Weg.
 *
 * Ablauf: API-/Client-Key stehen als JSON in einem <script type="application/json">
 * der Startseite; damit GET {api}/offers/search?as=web&q=...&zipCode=...
 */
import type { NormalizedOffer, OfferSource } from "./types";

const SITE = "https://www.marktguru.at";
const API = "https://api.marktguru.at/api/v1";

interface Keys {
  apiKey: string;
  clientKey: string;
}

let keyCache: { keys: Keys; at: number } | null = null;

async function getKeys(): Promise<Keys> {
  if (keyCache && Date.now() - keyCache.at < 6 * 3600 * 1000) return keyCache.keys;
  const res = await fetch(SITE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; smart-grocery-ai/0.2)" } });
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
}

const dateOnly = (s: unknown): string | null => (typeof s === "string" && s.length >= 10 ? s.slice(0, 10) : null);

export const marktguru: OfferSource = {
  id: "marktguru",
  async search(term, { zip, limit = 30 }) {
    const keys = await getKeys();
    const url = new URL(`${API}/offers/search`);
    url.search = new URLSearchParams({ as: "web", q: term, limit: String(limit), offset: "0", zipCode: zip }).toString();
    const res = await fetch(url, { headers: { "x-apikey": keys.apiKey, "x-clientkey": keys.clientKey } });
    if (res.status === 401 || res.status === 403) keyCache = null;
    if (!res.ok) throw new Error(`marktguru Suche '${term}': Status ${res.status}`);
    const data = (await res.json()) as { results?: any[] };
    const out: NormalizedOffer[] = [];
    for (const o of data.results ?? []) {
      const adv = o.advertisers?.[0];
      const priceCents = typeof o.price === "number" ? Math.round(o.price * 100) : NaN;
      const name = o.product?.name;
      if (!adv?.uniqueName || !name || !Number.isFinite(priceCents)) continue;
      const v = o.validityDates?.[0];
      // Packungsgroesse steht meist in description ("500 g", "6 x 0,33 l"); unit.shortName als Zusatz.
      const desc = [o.description, o.unit?.shortName && o.unit.shortName !== "Stk" ? o.unit.shortName : null]
        .filter(Boolean)
        .join(" ");
      out.push({
        source: "marktguru",
        externalId: o.id != null ? String(o.id) : null,
        retailerId: String(adv.uniqueName).toLowerCase(),
        retailerName: adv.name ?? String(adv.uniqueName),
        productName: String(name),
        brand: o.brand?.name ?? null,
        description: desc || null,
        priceCents,
        oldPriceCents: typeof o.oldPrice === "number" ? Math.round(o.oldPrice * 100) : null,
        validFrom: dateOnly(v?.from),
        validTo: dateOnly(v?.to),
        // Bild-/Logo-URL-Schema aus der Library `marktguru` (CDN dort fuer .de); unverifiziert fuer .at.
        // Das Frontend faellt bei Ladefehlern auf Kategorie-Icon bzw. Haendler-Initialen zurueck.
        imageUrl: o.id != null ? `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/medium.jpg` : null,
        categoryHint: o.categories?.[0]?.name ?? null,
        retailerLogoUrl: adv.id != null ? `https://mg2de.b-cdn.net/api/v1/${adv.id}/images/logos/0/small.png` : null,
      });
    }
    return out;
  },
};
