/** Text-Normalisierung, Tokenisierung und Packungsgroessen-Parsing fuer Angebote/Zutaten. */
import { parseQuantity } from "../cookidoo/quantity";

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s%.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "und", "oder", "mit", "ohne", "fuer", "von", "aus", "der", "die", "das", "den", "dem", "ein", "eine",
  "frisch", "frische", "frischer", "frisches", "gross", "grosse", "klein", "kleine", "bio", "natur",
  "stueck", "stk", "pro", "ca", "etwa", "nach", "bedarf", "optional", "gehackt", "gehackte", "gemahlen",
  "geschaelt", "geschnitten", "gewuerfelt", "gerieben", "geriebener", "weich", "weiche", "warm", "kalt",
  "tk", "tiefgekuehlt", "dose", "dosen", "packung", "glas",
]);

/** Sehr einfacher deutscher Stemmer (nur Pluralendungen), bewusst konservativ. */
export function stem(tok: string): string {
  if (tok.length > 6 && tok.endsWith("en")) return tok.slice(0, -2);
  if (tok.length > 5 && (tok.endsWith("er") || tok.endsWith("es"))) return tok.slice(0, -2);
  if (tok.length > 4 && (tok.endsWith("n") || tok.endsWith("e") || tok.endsWith("s"))) return tok.slice(0, -1);
  return tok;
}

export function tokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of fold(s).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    const t = stem(raw);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export interface Pack {
  amount: number | null; // Basiseinheit g / ml / Stk
  dimension: "mass" | "volume" | "count" | null;
}

/**
 * Packungsgroesse aus Freitext ("500 g", "6 x 0,33 l", "1,5kg", "10 Stk.") ermitteln.
 */
export function parsePack(text: string | null | undefined): Pack {
  if (!text) return { amount: null, dimension: null };
  const t = fold(text);
  const re = /(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|dag|mg|gr|g|ml|cl|dl|l|stk|stueck)\b/;
  const m = re.exec(t);
  if (!m) return { amount: null, dimension: null };
  const mult = m[1] ? Number(m[1]) : 1;
  const q = parseQuantity(`${m[2]} ${m[3]}`);
  if (q.baseLow === null) return { amount: null, dimension: null };
  const dim = q.dimension === "mass" ? "mass" : q.dimension === "volume" ? "volume" : q.dimension === "count" ? "count" : null;
  return { amount: q.baseLow * mult, dimension: dim };
}

/** Preis je kg/l (in Cent) aus Packungspreis und Packungsgroesse. */
export function unitPriceCents(priceCents: number, pack: Pack): { cents: number; basis: "kg" | "l" | "Stk" } | null {
  if (!pack.amount || !pack.dimension) return null;
  if (pack.dimension === "mass") return { cents: Math.round((priceCents / pack.amount) * 1000), basis: "kg" };
  if (pack.dimension === "volume") return { cents: Math.round((priceCents / pack.amount) * 1000), basis: "l" };
  return { cents: Math.round(priceCents / pack.amount), basis: "Stk" };
}
