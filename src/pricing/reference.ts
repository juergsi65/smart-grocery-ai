/**
 * Richtwerte fuer Standardartikel (Eigenmarke/Basis-Sortiment, Diskonter-Niveau, AT, Stand Nov. 2026).
 * GESCHAETZT, keine gemessenen Preise: Die UI kennzeichnet sie als "ca.". Echte Preise (gelernte
 * Streichpreise, manuelle Eingaben) haben immer Vorrang.
 */
import { lexicalScore, STRONG } from "../matching/lexical";
import { unitPriceCents, type Pack } from "../offers/normalize";

export interface RefEntry {
  names: string[];
  amount: number; // Basiseinheit g / ml / Stk
  dimension: "mass" | "volume" | "count";
  cents: number; // je Packung
}

const g = (names: string, amount: number, cents: number): RefEntry => ({ names: names.split("|"), amount, dimension: "mass", cents });
const ml = (names: string, amount: number, cents: number): RefEntry => ({ names: names.split("|"), amount, dimension: "volume", cents });
const st = (names: string, amount: number, cents: number): RefEntry => ({ names: names.split("|"), amount, dimension: "count", cents });

export const REFERENCE: RefEntry[] = [
  // Obst & Gemuese
  g("Tomaten|Rispentomaten|Cocktailtomaten", 500, 199), st("Gurke|Salatgurke", 1, 89), st("Paprika", 1, 99),
  g("Zwiebeln|Zwiebel", 1000, 149), st("Knoblauch", 1, 69), g("Karotten|Moehren|Karotte", 1000, 149),
  g("Kartoffeln|Erdaepfel|Kartoffel", 2000, 299), st("Zucchini", 1, 99), g("Aepfel|Apfel", 1000, 249),
  g("Bananen|Banane", 1000, 179), st("Zitrone|Zitronen", 1, 49), g("Champignons|Pilze", 250, 169),
  st("Salat|Eisbergsalat", 1, 119), g("Brokkoli", 500, 199), st("Lauch", 1, 129), st("Avocado", 1, 119),
  st("Petersilie|Schnittlauch|Basilikum", 1, 99), g("Ingwer", 100, 99), g("Spinat", 450, 179),
  // Milch, Eier, Kaese
  ml("Milch|Vollmilch|Frischmilch", 1000, 139), g("Butter", 250, 279), st("Eier|Ei", 10, 399),
  g("Joghurt|Naturjoghurt", 500, 129), ml("Obers|Schlagobers|Sahne", 250, 149), g("Sauerrahm", 200, 89),
  g("Topfen|Quark", 250, 149), g("Mozzarella", 125, 99), g("Parmesan", 100, 229), g("Gouda|Kaese|Emmentaler", 150, 199),
  g("Frischkaese", 200, 149), g("Feta", 200, 199),
  // Fleisch & Fisch
  g("Faschiertes|Hackfleisch", 500, 499), g("Haehnchenfilet|Huehnerfilet|Haehnchen|Huhn|Huehnerbrust", 500, 699),
  g("Schinken", 100, 179), g("Speck", 150, 229), g("Lachs|Lachsfilet", 250, 599),
  // Vorrat
  g("Nudeln|Spaghetti|Penne|Pasta", 500, 129), g("Reis", 1000, 229), g("Mehl", 1000, 129), g("Zucker", 1000, 149),
  g("Salz", 1000, 79), ml("Olivenoel|Olivenol", 750, 699), ml("Sonnenblumenoel|Rapsoel|Oel", 1000, 249),
  g("Haferflocken", 500, 129), g("Linsen", 500, 199), g("Kichererbsen", 400, 99), g("Passierte Tomaten|Tomatensauce", 500, 109),
  g("Dosentomaten|Tomaten gehackt", 400, 99), g("Mais", 285, 99), ml("Kokosmilch", 400, 169), g("Tomatenmark", 200, 119),
  g("Germ|Hefe", 42, 49), ml("Essig", 1000, 129), g("Senf", 200, 119), g("Ketchup", 500, 199), ml("Mayonnaise|Mayo", 250, 179),
  ml("Sojasauce", 150, 179), g("Honig", 500, 499), g("Marmelade", 450, 229), g("Schokolade", 100, 129),
  g("Mandeln|Nuesse|Walnuesse", 200, 349), g("Kaffee", 500, 799), g("Semmelbroesel|Paniermehl", 500, 149),
  g("Couscous", 500, 179), g("Toastbrot|Toast", 500, 149), st("Tortilla|Wraps", 8, 249), g("Pfeffer", 40, 199),
  // Getraenke / TK
  ml("Mineralwasser|Wasser", 1500, 49), ml("Orangensaft|Saft", 1000, 169), g("Pizza", 350, 249), g("Tiefkuehlgemuese", 450, 189),
];

/** Beste Richtwert-Zeile zur Zutat (nur klare Treffer). */
export function findReference(ingredient: string): RefEntry | null {
  let best: { e: RefEntry; s: number } | null = null;
  for (const e of REFERENCE) {
    for (const n of e.names) {
      const s = lexicalScore(ingredient, { product_name: n, brand: null });
      if (s >= STRONG && (!best || s > best.s)) best = { e, s };
    }
  }
  return best?.e ?? null;
}

/** Realistisch wirkender Endpreis (xx9 Cent), Mindestpreis 29 Cent. */
export const shelfRound = (cents: number): number => Math.max(29, Math.round(cents / 10) * 10 - 1);

export function estimatePrice(e: RefEntry, factor: number): { cents: number; pack: Pack; unit: ReturnType<typeof unitPriceCents> } {
  const cents = shelfRound(e.cents * factor);
  const pack: Pack = { amount: e.amount, dimension: e.dimension };
  return { cents, pack, unit: unitPriceCents(cents, pack) };
}
