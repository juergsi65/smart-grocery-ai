import { describe, expect, it } from "vitest";
import type { MatchedOffer } from "../src/matching";
import { buildOption, buildOptions, optimize, planAll, type Need } from "../src/optimizer";

let id = 0;
const offer = (retailer: string, price: number, extra: Partial<MatchedOffer> = {}): MatchedOffer => ({
  id: ++id, source: "t", retailer_id: retailer, retailer_name: retailer.toUpperCase(), product_name: "x", brand: null,
  description: null, price_cents: price, old_price_cents: null, unit_price_cents: null, unit_price_basis: null,
  pack_amount: null, pack_dimension: null, valid_from: null, valid_to: null, image_url: null, category: null, discount_pct: null, score: 1, via: "lexical", ...extra,
});
const need = (key: string, amount: number | null = null, dimension: Need["dimension"] = null): Need => ({
  key, name: key, display: key, category: "sonstiges", amount, dimension,
});

describe("buildOption", () => {
  it("rechnet Packungen hoch und Verschnitt", () => {
    const o = buildOption(need("mehl", 1500, "mass"), offer("billa", 99, { pack_amount: 1000, pack_dimension: "mass" }));
    expect(o.packs).toBe(2);
    expect(o.costCents).toBe(198);
    expect(o.wastePct).toBeCloseTo(0.25);
  });
  it("Dimension passt nicht -> 1 Packung", () => {
    const o = buildOption(need("gurke", 400, "mass"), offer("spar", 79, { pack_amount: 1, pack_dimension: "count" }));
    expect(o.packs).toBe(1);
    expect(o.wastePct).toBeNull();
  });
  it("Ersparnis aus Streichpreis x Packungen", () => {
    const o = buildOption(need("a", 2000, "mass"), offer("x", 100, { old_price_cents: 150, pack_amount: 1000, pack_dimension: "mass" }));
    expect(o.savingsCents).toBe(100);
  });
});

describe("optimize", () => {
  const needs = [need("a"), need("b"), need("c")];
  const matches = new Map<string, MatchedOffer[]>([
    ["a", [offer("billa", 100), offer("spar", 90)]],
    ["b", [offer("billa", 200), offer("hofer", 150)]],
    ["c", [offer("billa", 300)]],
  ]);
  const options = buildOptions(needs, matches);

  it("one-stop nimmt den Haendler mit bester Abdeckung", () => {
    const p = optimize(needs, options, { maxStores: 1, strategy: "one-stop" });
    expect(p.stores).toHaveLength(1);
    expect(p.stores[0].retailerId).toBe("billa");
    expect(p.coveredCount).toBe(3);
    expect(p.uncovered).toHaveLength(0);
  });
  it("cheapest nimmt je Zutat das guenstigste Angebot", () => {
    const p = optimize(needs, options, { maxStores: null, strategy: "cheapest" });
    expect(p.totalCents).toBe(90 + 150 + 300);
    expect(p.stores.map((s) => s.retailerId).sort()).toEqual(["billa", "hofer", "spar"]);
  });
  it("two-stops liegt zwischen one-stop und cheapest im Preis", () => {
    const [one, two, cheap] = planAll(needs, options);
    expect(cheap.totalCents).toBeLessThanOrEqual(two.totalCents);
    expect(two.totalCents).toBeLessThanOrEqual(one.totalCents);
    expect(two.stores.length).toBeLessThanOrEqual(2);
  });
  it("Zutat ohne Angebot landet in uncovered", () => {
    const n = [...needs, need("salz")];
    const p = optimize(n, buildOptions(n, matches), { maxStores: null });
    expect(p.uncovered.map((u) => u.key)).toEqual(["salz"]);
    expect(p.totalCount).toBe(4);
  });
  it("excludedRetailers wird respektiert", () => {
    const p = optimize(needs, options, { maxStores: null, excludedRetailers: new Set(["billa"]) });
    expect(p.stores.some((s) => s.retailerId === "billa")).toBe(false);
    expect(p.uncovered.map((u) => u.key)).toEqual(["c"]);
  });
});
