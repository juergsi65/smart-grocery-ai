/** Lexikalischer Match-Score Zutat <-> Angebot (0..1). Deterministisch, kostenlos. */
import { stem, tokens } from "../offers/normalize";
import type { OfferRow } from "../offers/types";

/** Beschreibende Woerter, die die Zutat nicht aendern (zaehlen nur zu 25 % im Score). */
const DESCRIPTORS = new Set([
  "rot", "rote", "roter", "rotes", "gruen", "gruene", "gelb", "gelbe", "weiss", "weisse", "schwarz", "schwarze",
  "type", "universal", "griffig", "glatt", "fein", "feine", "extra", "classic", "klassik", "original", "premium",
  "mild", "milde", "vollmilch", "mittel", "lose", "kugel", "kugeln", "rispen", "strauch", "cherry", "mini",
  "wuerfel", "scheiben", "streifen", "stuecke", "natur", "naturell", "bio", "regional", "ja", "billa", "spar", "hofer",
]);

/**
 * Hinweise auf verarbeitete Produkte, in denen die Zutat nur enthalten ist
 * ("Tomaten Ketchup", "Mozzarella Pizza"). Solche Treffer nie ohne KI akzeptieren.
 */
const PROCESSED = new Set([
  "ketchup", "sauce", "sosse", "soße", "suppe", "pizza", "chips", "saft", "nektar", "dressing", "aufstrich", "pesto",
  "marmelade", "konfituere", "fertig", "fertiggericht", "menue", "riegel", "keks", "kekse", "kuchen", "eis", "limo",
  "getraenk", "drink", "shake", "smoothie", "mischung", "snack", "lasagne", "ravioli", "tortellini", "gnocchi",
]);

const weight = (t: string): number => (DESCRIPTORS.has(t) ? 0.25 : 1);

function tokenMatches(t: string, o: string): boolean {
  return o === t || (t.length >= 4 && o.includes(t)) || (o.length >= 4 && t.includes(o));
}

/**
 * Gewichteter Dice-Koeffizient ueber Tokens mit Teilstring-Toleranz (deutsche Komposita):
 * "tomate" passt auf "cocktailtomate". Zusatzwoerter im Angebotsnamen ("ketchup")
 * senken den Score, Beschreibungswoerter ("rot", "type") nur wenig.
 */
export function lexicalScore(ingredientName: string, offer: Pick<OfferRow, "product_name" | "brand">): number {
  const ing = tokens(ingredientName);
  const off = tokens(offer.product_name);
  if (!ing.length || !off.length) return 0;
  let matchedW = 0;
  for (const t of ing) if (off.some((o) => tokenMatches(t, o))) matchedW += weight(t);
  if (matchedW === 0) return 0;
  const ingW = ing.reduce((s, t) => s + weight(t), 0);
  const offW = off.reduce((s, t) => s + weight(t), 0);
  return (2 * matchedW) / (ingW + offW);
}

/**
 * Enthaelt der Angebotsname ein Verarbeitungs-Signalwort, das NICHT selbst Teil der gesuchten
 * Zutat ist? (Zutat "Ketchup" darf "Ketchup" matchen; Zutat "Tomaten" nicht "Tomaten Ketchup".)
 */
export function looksProcessed(offerName: string, ingredientName?: string): boolean {
  const own = new Set(ingredientName ? tokens(ingredientName) : []);
  return tokens(offerName).some((t) => PROCESSED.has(t) && !own.has(t));
}

/** Passt ein Zutaten-Token auf das ERSTE Token des Angebotsnamens (meist der Produktkern)? */
export function headMatches(ingredientName: string, offerName: string): boolean {
  const off = tokens(offerName);
  if (!off.length) return false;
  return tokens(ingredientName).some((t) => weight(t) === 1 && tokenMatches(t, off[0]));
}

/** Fallback ohne KI fuer mehrdeutige Kandidaten: Produktkern vorn und kein Verarbeitungs-Signal. */
export function fallbackAccept(ingredientName: string, offer: Pick<OfferRow, "product_name" | "brand">): boolean {
  return headMatches(ingredientName, offer.product_name) && !looksProcessed(offer.product_name, ingredientName);
}

export const STRONG = 0.75;
export const WEAK = 0.4;

export { stem };
