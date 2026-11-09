/**
 * Lebensmittel-Fokus fuer Oesterreich: nur Supermarkt-/Lebensmittelhaendler und keine
 * Nicht-Lebensmittel-Kategorien (Elektronik, Baumarkt, Mode, ...).
 */
import { fold } from "./normalize";

/** Slug-Basen der erlaubten Haendler (Marktguru `uniqueName`, z. B. "billa-plus", "eurospar"). */
const FOOD_RETAILER_BASES = [
  "billa", "spar", "eurospar", "interspar", "hofer", "lidl", "penny", "mpreis",
  "unimarkt", "adeg", "denns",
];

export const slug = (s: string): string =>
  fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Exakter Treffer oder Slug mit Bindestrich-Zusatz ("billa-plus"), damit "sparkasse" nicht als "spar" zaehlt. */
export function isFoodRetailer(uniqueName: string | null | undefined, name?: string | null): boolean {
  for (const raw of [uniqueName, name]) {
    if (!raw) continue;
    const s = slug(raw);
    if (FOOD_RETAILER_BASES.some((b) => s === b || s.startsWith(`${b}-`))) return true;
  }
  return false;
}

/** Wortanfaenge gefalteter Kategorienamen, die sicher nichts mit Lebensmitteln zu tun haben. */
const NON_FOOD_PREFIXES = [
  "elektro", "computer", "handy", "smartphone", "multimedia", "tv", "foto", "baumarkt", "heimwerk", "werkzeug",
  "garten", "pflanzen", "mode", "bekleidung", "textil", "schuhe", "accessoires", "schmuck", "uhren", "moebel",
  "einrichtung", "wohnen", "spielwaren", "spielzeug", "baby-ausstattung", "sport", "freizeit", "fahrrad",
  "auto", "kfz", "buecher", "buero", "schreibwaren", "reisen", "optik", "tierbedarf", "haustier",
];

export function isNonFoodCategory(hint: string | null | undefined): boolean {
  if (!hint) return false;
  const tokens = fold(hint).split(/[^a-z0-9-]+/).filter(Boolean);
  return tokens.some((t) => NON_FOOD_PREFIXES.some((p) => t === p || t.startsWith(p)));
}
