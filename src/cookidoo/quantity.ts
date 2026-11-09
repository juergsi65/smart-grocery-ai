/**
 * Parsing und Normalisierung von Cookidoo-Mengenangaben (Port von quantity.py).
 *
 * Cookidoo liefert Zutaten als (name, description); description ist
 * "<menge> <einheit>" mit Menge als Zahl oder Bereich ("1 - 2"). Fehlende Teile
 * erscheinen als Literal "None".
 */

export type Dimension = "mass" | "volume" | "spoon" | "count" | "qualitative";

interface UnitDef {
  canon: string;
  dim: Dimension;
  factor: number;
}

const u = (canon: string, dim: Dimension, factor = 1): UnitDef => ({ canon, dim, factor });

// Notation (lowercase, Umlaute aufgeloest) -> Definition. Basis: MASS -> g, VOLUME -> ml.
const UNIT_REGISTRY: Record<string, UnitDef> = {
  g: u("g", "mass"),
  gr: u("g", "mass"),
  gramm: u("g", "mass"),
  kg: u("g", "mass", 1000),
  mg: u("g", "mass", 0.001),
  dag: u("g", "mass", 10), // Dekagramm (in AT gebraeuchlich)
  deka: u("g", "mass", 10),
  ml: u("ml", "volume"),
  l: u("ml", "volume", 1000),
  liter: u("ml", "volume", 1000),
  cl: u("ml", "volume", 10),
  dl: u("ml", "volume", 100),
  el: u("EL", "spoon"),
  essloeffel: u("EL", "spoon"),
  tl: u("TL", "spoon"),
  teeloeffel: u("TL", "spoon"),
  msp: u("Msp", "spoon"),
  messerspitze: u("Msp", "spoon"),
  stk: u("Stk", "count"),
  stueck: u("Stk", "count"),
  bund: u("Bund", "count"),
  zehe: u("Zehe", "count"),
  zehen: u("Zehe", "count"),
  dose: u("Dose", "count"),
  dosen: u("Dose", "count"),
  packung: u("Packung", "count"),
  pkg: u("Packung", "count"),
  glas: u("Glas", "count"),
  becher: u("Becher", "count"),
  scheibe: u("Scheibe", "count"),
  scheiben: u("Scheibe", "count"),
  blatt: u("Blatt", "count"),
  blaetter: u("Blatt", "count"),
  wuerfel: u("Wuerfel", "count"),
  tropfen: u("Tropfen", "count"),
  prise: u("Prise", "qualitative"),
  prisen: u("Prise", "qualitative"),
  etwas: u("etwas", "qualitative"),
};

const EMPTY_TOKENS = new Set(["", "none", "nan", "n.b.", "nb", "nach bedarf"]);

const QTY_RE =
  /^\s*(?:(?<from>\d+(?:[.,]\d+)?)\s*-\s*(?<to>\d+(?:[.,]\d+)?)|(?<val>\d+(?:[.,]\d+)?))?\s*(?<unit>.*?)\s*$/s;

export interface Quantity {
  low: number | null;
  high: number | null;
  unit: string | null;
  dimension: Dimension;
  raw: string;
  baseLow: number | null;
  baseHigh: number | null;
}

export const hasValue = (q: Quantity): boolean => q.low !== null;
export const isRange = (q: Quantity): boolean =>
  q.low !== null && q.high !== null && q.low !== q.high;

/** Zwei Mengen sind summierbar, wenn der Merge-Key identisch ist. */
export function mergeKey(q: Quantity): string {
  if (q.dimension === "mass") return "mass|g";
  if (q.dimension === "volume") return "volume|ml";
  return `${q.dimension}|${q.unit ?? ""}`;
}

function toFloat(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(",", ".");
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null;
  const n = Number(s);
  return Number.isFinite(n) && s !== "" ? n : null;
}

function lookupUnit(token: string): { canon: string | null; dim: Dimension; factor: number } {
  let key = token.trim().toLowerCase().replace(/\.+$/, "");
  key = key.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  if (EMPTY_TOKENS.has(key)) return { canon: null, dim: "qualitative", factor: 1 };
  const def = UNIT_REGISTRY[key];
  if (def) return { canon: def.canon, dim: def.dim, factor: def.factor };
  // Unbekannte, aber vorhandene Einheit: zaehlbar mit Originalnotation.
  return { canon: token.trim(), dim: "count", factor: 1 };
}

export function parseQuantity(description: string | null | undefined): Quantity {
  const raw = (description ?? "").trim();
  // Literal "None" (fehlender Wert/Einheit) vorab entfernen.
  const cleaned = raw.replace(/\bNone\b/g, " ").replace(/\s+/g, " ").trim();
  const m = QTY_RE.exec(cleaned);
  if (!m || !m.groups) {
    return { low: null, high: null, unit: null, dimension: "qualitative", raw, baseLow: null, baseHigh: null };
  }
  const val = toFloat(m.groups.val);
  const frm = toFloat(m.groups.from);
  const to = toFloat(m.groups.to);
  const unitToken = (m.groups.unit ?? "").trim();

  let low: number | null;
  let high: number | null;
  if (frm !== null || to !== null) {
    low = frm;
    high = to !== null ? to : frm;
  } else if (val !== null) {
    low = high = val;
  } else {
    low = high = null;
  }

  const { canon, dim: dimLookup, factor } = lookupUnit(unitToken);
  let dimension = dimLookup;
  if (low === null && canon === null) dimension = "qualitative";

  let baseLow = low;
  let baseHigh = high;
  if (dimension === "mass" || dimension === "volume") {
    baseLow = low !== null ? low * factor : null;
    baseHigh = high !== null ? high * factor : null;
  }
  return { low, high, unit: canon, dimension, raw, baseLow, baseHigh };
}

/** 200 -> "200", 1.5 -> "1,5" (DE) */
export function formatNumber(x: number | null): string {
  if (x === null) return "";
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}
