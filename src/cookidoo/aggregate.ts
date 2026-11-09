/**
 * Zusammenfuehren von Zutaten ueber mehrere Rezepte (Port von aggregate.py).
 * Deterministisch: Gruppierung nach normalisiertem Namen, Summierung kompatibler
 * Einheiten, Trennung inkompatibler Mengen, qualitative Angaben als Hinweise.
 */
import { Dimension, Quantity, formatNumber, hasValue, mergeKey, parseQuantity } from "./quantity";

export interface CanonicalIngredient {
  name: string;
  quantity: Quantity;
  sourceRecipeId?: string | null;
  sourceRecipeName?: string | null;
}

export function ingredientFromCookidoo(
  name: string,
  description: string | null | undefined,
  recipeId?: string | null,
  recipeName?: string | null,
): CanonicalIngredient {
  return {
    name: name.trim(),
    quantity: parseQuantity(description),
    sourceRecipeId: recipeId ?? null,
    sourceRecipeName: recipeName ?? null,
  };
}

export interface Amount {
  unit: string | null;
  dimension: Dimension;
  low: number;
  high: number;
  display: string;
}

export interface AggregatedIngredient {
  name: string;
  amounts: Amount[];
  qualitativeNotes: string[];
  sourceRecipeIds: string[];
  sourceRecipeNames: string[];
  display: string;
}

function amountDisplay(unit: string | null, low: number, high: number): string {
  const u = unit ? ` ${unit}` : "";
  return low !== high
    ? `${formatNumber(low)}-${formatNumber(high)}${u}`.trim()
    : `${formatNumber(low)}${u}`.trim();
}

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayUnit(dim: Dimension, lo: number, hi: number): [string | null, number, number] {
  if (dim === "mass") return lo >= 1000 && hi >= 1000 ? ["kg", lo / 1000, hi / 1000] : ["g", lo, hi];
  if (dim === "volume") return lo >= 1000 && hi >= 1000 ? ["l", lo / 1000, hi / 1000] : ["ml", lo, hi];
  return [null, lo, hi];
}

export function aggregate(ingredients: CanonicalIngredient[]): AggregatedIngredient[] {
  type Bucket = { dim: Dimension; unit: string | null; low: number; high: number };
  const groups = new Map<string, AggregatedIngredient>();
  const buckets = new Map<string, Map<string, Bucket>>();

  for (const ing of ingredients) {
    const key = normalizeName(ing.name);
    if (!groups.has(key)) {
      groups.set(key, {
        name: ing.name.trim(),
        amounts: [],
        qualitativeNotes: [],
        sourceRecipeIds: [],
        sourceRecipeNames: [],
        display: "",
      });
      buckets.set(key, new Map());
    }
    const agg = groups.get(key)!;
    if (ing.sourceRecipeId && !agg.sourceRecipeIds.includes(ing.sourceRecipeId)) {
      agg.sourceRecipeIds.push(ing.sourceRecipeId);
    }
    if (ing.sourceRecipeName && !agg.sourceRecipeNames.includes(ing.sourceRecipeName)) {
      agg.sourceRecipeNames.push(ing.sourceRecipeName);
    }

    const q = ing.quantity;
    if (!hasValue(q)) {
      const note = q.raw || q.unit || "";
      if (note && !agg.qualitativeNotes.includes(note)) agg.qualitativeNotes.push(note);
      continue;
    }
    const mk = mergeKey(q);
    const bm = buckets.get(key)!;
    const b = bm.get(mk) ?? { dim: q.dimension, unit: q.unit, low: 0, high: 0 };
    b.low += q.baseLow ?? 0;
    b.high += q.baseHigh ?? 0;
    bm.set(mk, b);
  }

  for (const [key, agg] of groups) {
    for (const b of buckets.get(key)!.values()) {
      let unit: string | null;
      let lo: number;
      let hi: number;
      if (b.dim === "mass" || b.dim === "volume") {
        [unit, lo, hi] = toDisplayUnit(b.dim, b.low, b.high);
      } else {
        unit = b.unit;
        lo = b.low;
        hi = b.high;
      }
      agg.amounts.push({ unit, dimension: b.dim, low: lo, high: hi, display: amountDisplay(unit, lo, hi) });
    }
    agg.amounts.sort((a, b) => (a.dimension + (a.unit ?? "")).localeCompare(b.dimension + (b.unit ?? "")));
    const parts = [...agg.amounts.map((a) => a.display), ...agg.qualitativeNotes].filter(Boolean);
    agg.display = parts.length ? `${parts.join(" + ")} ${agg.name}`.trim() : agg.name;
  }

  return [...groups.values()].sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));
}
