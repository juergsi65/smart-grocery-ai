/**
 * Eigene Regal-Kategorien (Reihenfolge = typischer Gang durch den Supermarkt).
 * Zuordnung per Schluesselwoertern auf dem gefalteten Produktnamen; eine Kategorie-Angabe der
 * Quelle (z. B. Marktguru) dient nur als Hinweis, wenn der Name nichts ergibt.
 */
import { fold } from "./offers/normalize";

export interface Category {
  id: string;
  name: string;
  icon: string; // Emoji als Ersatzbild, wenn kein Produktfoto da ist
  order: number;
}

export const CATEGORIES: Category[] = [
  { id: "obst-gemuese", name: "Obst & Gemüse", icon: "🥬", order: 1 },
  { id: "brot-gebaeck", name: "Brot & Gebäck", icon: "🥖", order: 2 },
  { id: "milch-eier", name: "Milch, Käse & Eier", icon: "🧀", order: 3 },
  { id: "fleisch-fisch", name: "Fleisch, Wurst & Fisch", icon: "🥩", order: 4 },
  { id: "tiefkuehl", name: "Tiefkühl", icon: "🧊", order: 5 },
  { id: "vorrat", name: "Nudeln, Reis & Konserven", icon: "🍝", order: 6 },
  { id: "oel-gewuerze", name: "Öl, Gewürze & Saucen", icon: "🫒", order: 7 },
  { id: "suess-snacks", name: "Süßes & Snacks", icon: "🍫", order: 8 },
  { id: "getraenke", name: "Getränke", icon: "🥤", order: 9 },
  { id: "haushalt", name: "Haushalt & Drogerie", icon: "🧴", order: 10 },
  { id: "sonstiges", name: "Sonstiges", icon: "🛒", order: 11 },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryOrder = (id: string | null | undefined): number => CATEGORY_BY_ID.get(id ?? "")?.order ?? 99;

/**
 * Schluesselwort-Syntax (auf gefalteten Tokens):
 *   "tomat"  -> Token enthaelt das Wort (Komposita: "cocktailtomaten")
 *   "=eis"   -> Token ist genau dieses Wort
 *   "^oel"   -> Token beginnt damit
 *   "$oel"   -> Token endet damit ("olivenoel")
 * Reihenfolge der Regeln = Prioritaet (spezifisch vor allgemein).
 */
const RULES: [string, string[]][] = [
  ["vorrat", ["kokosmilch", "passiert", "dosentomat", "tomatenmark", "konserve", "=dose", "=dosen", "haferflocken", "muesli", "cornflakes"]],
  ["tiefkuehl", ["tiefkuehl", "=tk", "^tk-", "speiseeis", "=eis", "eiscreme", "pizza", "pommes", "fischstaebchen", "$stabchen"]],
  ["haushalt", ["waschmittel", "spuelmittel", "weichspueler", "toilettenpapier", "kuechenrolle", "taschentuch", "shampoo", "duschgel", "zahnpasta", "zahnbuerste", "deo", "reiniger", "windel", "muellsack", "spuelmaschinen", "rasier", "seife", "binden", "tampon", "putz", "alufolie", "backpapier", "gefrierbeutel"]],
  ["getraenke", ["=wasser", "$wasser", "mineral", "saft", "nektar", "cola", "limo", "fanta", "sprite", "eistee", "energy", "bier", "=wein", "$wein", "sekt", "prosecco", "spritz", "schnaps", "likoer", "vodka", "=gin", "whisky", "=rum", "kaffee", "espresso", "kapsel", "=tee", "^tee", "sirup", "smoothie", "radler"]],
  ["oel-gewuerze", ["$oel", "=oel", "essig", "=salz", "pfeffer", "gewuerz", "senf", "ketchup", "mayonnaise", "mayo", "sauce", "sosse", "curry", "zimt", "bruehe", "suppenwuerfel", "sojasauce", "pesto", "dressing", "paprikapulver", "muskat", "oregano", "thymian", "rosmarin"]],
  ["suess-snacks", ["schokolade", "praline", "keks", "waffel", "gummi", "bonbon", "lutscher", "riegel", "chips", "flips", "nuss", "nuesse", "mandel", "erdnuss", "popcorn", "cracker", "salzstangen", "kuchen", "torte", "honig", "marmelade", "nutella", "nougat", "bonbons", "snack", "zucker", "backmischung"]],
  ["fleisch-fisch", ["huhn", "haehnchen", "haendl", "pute", "schwein", "rind", "kalb", "lamm", "faschiert", "hackfleisch", "wurst", "schinken", "speck", "salami", "leberkaese", "bratwurst", "knacker", "steak", "schnitzel", "filet", "lachs", "thunfisch", "garnele", "forelle", "fisch", "krabben", "gulasch", "braten", "surimi", "kotelett", "burger"]],
  ["milch-eier", ["milch", "joghurt", "jogurt", "butter", "kaese", "mozzarella", "parmesan", "gouda", "feta", "emmentaler", "camembert", "topfen", "quark", "obers", "sahne", "rahm", "creme fraiche", "frischkaese", "=eier", "^ei-", "=ei", "margarine", "skyr", "pudding", "kefir"]],
  ["brot-gebaeck", ["brot", "semmel", "weckerl", "toast", "gebaeck", "croissant", "brezel", "kipferl", "baguette", "toastbrot", "brioche", "laugen", "fladenbrot", "tortilla", "wraps"]],
  ["obst-gemuese", ["tomat", "gurke", "paprika", "zwiebel", "knoblauch", "karotte", "moehre", "kartoffel", "erdapfel", "zucchini", "melanzani", "aubergine", "brokkoli", "karfiol", "blumenkohl", "spinat", "salat", "champignon", "pilz", "lauch", "sellerie", "kuerbis", "avocado", "zitrone", "limette", "apfel", "aepfel", "banane", "birne", "orange", "mandarine", "traube", "beere", "erdbeer", "ingwer", "petersilie", "basilikum", "kraeuter", "schnittlauch", "obst", "gemuese", "kohl", "radieschen", "rucola", "mango", "ananas", "melone", "kiwi", "pfirsich", "marille", "zwetschke", "kirsche", "fenchel", "rote rueben", "rueben", "spargel", "mais", "erbsen", "bohnen"]],
  ["vorrat", ["nudel", "spaghetti", "penne", "fusilli", "tagliatelle", "=reis", "$reis", "mehl", "linsen", "kichererbsen", "couscous", "polenta", "bulgur", "backpulver", "germ", "hefe", "gries", "stärke", "staerke", "pasta", "teigwaren", "knoedel", "semmelbroesel", "aufstrich", "thunfisch dose"]],
];

function tokenMatches(tok: string, kw: string): boolean {
  if (kw.startsWith("=")) return tok === kw.slice(1);
  if (kw.startsWith("^")) return tok.startsWith(kw.slice(1));
  if (kw.startsWith("$")) return tok.endsWith(kw.slice(1));
  return tok.includes(kw);
}

function classify(text: string): string | null {
  const f = fold(text);
  const toks = f.split(/[^a-z0-9-]+/).filter(Boolean);
  for (const [id, kws] of RULES) {
    for (const kw of kws) {
      // Phrasen mit Leerzeichen gegen den ganzen Text pruefen, Einzelwoerter pro Token
      if (kw.includes(" ")) {
        if (f.includes(kw)) return id;
      } else if (toks.some((t) => tokenMatches(t, kw))) return id;
    }
  }
  return null;
}

/** Hinweis der Quelle (z. B. Marktguru-Kategorie "Obst & Gemüse") auf unsere Kategorien abbilden. */
const HINT_RULES: [RegExp, string][] = [
  [/obst|gemuese/, "obst-gemuese"],
  [/brot|backwaren|gebaeck/, "brot-gebaeck"],
  [/milch|molkerei|kaese|eier|kuehl/, "milch-eier"],
  [/fleisch|wurst|fisch|gefluegel/, "fleisch-fisch"],
  [/tiefkuehl|eis/, "tiefkuehl"],
  [/konserve|nudel|reis|teigwaren|grundnahrung|frühstück|fruehstueck|cerealien/, "vorrat"],
  [/oel|gewuerz|sauce|soss|essig/, "oel-gewuerze"],
  [/suess|snack|schoko|knabber|dessert/, "suess-snacks"],
  [/getraenk|bier|wein|spirituosen|kaffee|tee|saft|wasser/, "getraenke"],
  [/haushalt|drogerie|kosmetik|hygiene|reinigung|wasch|tier/, "haushalt"],
];

export function categorize(productName: string, hint?: string | null): string {
  const byName = classify(productName);
  if (byName) return byName;
  if (hint) {
    const h = fold(hint);
    for (const [re, id] of HINT_RULES) if (re.test(h)) return id;
  }
  return "sonstiges";
}

/** Rabatt in Prozent gegenueber dem Streichpreis (null ohne Streichpreis). */
export function discountPct(priceCents: number, oldPriceCents: number | null | undefined): number | null {
  if (!oldPriceCents || oldPriceCents <= priceCents || priceCents <= 0) return null;
  return Math.round(((oldPriceCents - priceCents) / oldPriceCents) * 100);
}
