import { categorize } from "../categories";
import { normalizeName, type AggregatedIngredient } from "../cookidoo/aggregate";
import type { Need, PackDim } from "../optimizer";

/** Aggregierte Zutat -> Bedarf in Basiseinheit (erste mass/volume/count-Menge, obere Grenze). */
export function toNeed(a: AggregatedIngredient): Need {
  const pick =
    a.amounts.find((x) => x.dimension === "mass" || x.dimension === "volume") ??
    a.amounts.find((x) => x.dimension === "count");
  let amount: number | null = null;
  let dimension: PackDim | null = null;
  if (pick) {
    dimension = pick.dimension as PackDim;
    const f = pick.unit === "kg" || pick.unit === "l" ? 1000 : 1;
    amount = pick.high * f;
  }
  return { key: normalizeName(a.name), name: a.name, display: a.display, category: categorize(a.name), amount, dimension };
}
