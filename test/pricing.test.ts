import { describe, expect, it } from "vitest";
import type { MatchedOffer } from "../src/matching";
import { buildOptions, optimize, planAll, retailerComparison, stopInsight, type Need } from "../src/optimizer";
import { estimatePrice, findReference, shelfRound } from "../src/pricing/reference";
import { resolveFromData } from "../src/pricing/resolver";
import type { BaseRow } from "../src/pricing/store";

let id = 0;
const need = (name: string, amount: number | null = null, dimension: Need["dimension"] = null): Need => ({
  key: name.toLowerCase(), name, display: name, category: "sonstiges", amount, dimension,
});
const offer = (retailer: string, price: number, name = "x", extra: Partial<MatchedOffer> = {}): MatchedOffer => ({
  id: ++id, source: "t", retailer_id: retailer, retailer_name: retailer.toUpperCase(), product_name: name, brand: null,
  description: null, price_cents: price, old_price_cents: null, unit_price_cents: null, unit_price_basis: null,
  pack_amount: null, pack_dimension: null, valid_from: null, valid_to: null, image_url: null, category: null, discount_pct: null,
  score: 1, via: "lexical", ...extra,
});
const baseRow = (retailer: string, name: string, price: number, source: BaseRow["source"], pack = 500): BaseRow => ({
  id: ++id, retailer_id: retailer, product_name: name, brand: null, description: null, price_cents: price,
  unit_price_cents: null, unit_price_basis: null, pack_amount: pack, pack_dimension: "mass", source, updated_at: 0,
});
const names = new Map<string, string | null>([["hofer", "HOFER"], ["billa", "BILLA"], ["spar", "SPAR"]]);
const logos = new Map<string, string | null>();

describe("Richtwerte", () => {
  it.each([["Salz", "Salz"], ["Mehl Type 480 universal", "Mehl"], ["Cocktailtomaten", "Tomaten"], ["Vollmilch", "Milch"], ["Haferflocken", "Haferflocken"]])(
    "%s -> Richtwert", (ing, first) => expect(findReference(ing)?.names.some((n) => n === first || n.startsWith(first))).toBe(true));
  it("kein Richtwert für Unbekanntes", () => expect(findReference("Drachenfrucht-Sirup")).toBeNull());
  it("Händlerfaktor und Rundung auf xx9", () => {
    const ref = findReference("Mehl")!;
    const hofer = estimatePrice(ref, 1).cents, billa = estimatePrice(ref, 1.18).cents;
    expect(hofer).toBe(129);
    expect(billa).toBeGreaterThan(hofer);
    expect(billa % 10).toBe(9);
    expect(shelfRound(10)).toBe(29);
  });
});

describe("PriceResolver", () => {
  const n = [need("Salz", 1000, "mass"), need("Mehl", 1000, "mass")];
  const offers = new Map<string, MatchedOffer[]>([["mehl", [offer("billa", 89, "Mehl universal", { pack_amount: 1000, pack_dimension: "mass" })]]]);

  it("Stufe 1: Aktionspreis markiert is_on_sale", () => {
    const { byKey } = resolveFromData({ needs: n, offers, base: [[], []], retailerIds: ["hofer", "billa"], names, logos });
    const billa = byKey.get("mehl")!.find((o) => o.retailer_id === "billa")!;
    expect(billa).toMatchObject({ is_on_sale: true, price_source: "offer", price_cents: 89 });
  });

  it("Stufe 2: Händler ohne Angebot bekommt Richtwert, Händler mit Angebot nicht doppelt", () => {
    const { byKey, stats } = resolveFromData({ needs: n, offers, base: [[], []], retailerIds: ["hofer", "billa"], names, logos });
    const mehl = byKey.get("mehl")!;
    expect(mehl.filter((o) => o.retailer_id === "billa")).toHaveLength(1);
    expect(mehl.find((o) => o.retailer_id === "hofer")).toMatchObject({ is_on_sale: false, price_source: "estimate" });
    expect(byKey.get("salz")!.map((o) => o.price_source)).toEqual(["estimate", "estimate"]); // Salz: nie im Flugblatt
    expect(stats).toMatchObject({ onSale: 1, estimated: 3, unresolved: 0 });
  });

  it("gespeicherte Normalpreise schlagen Richtwerte, manuell schlägt gelernt", () => {
    const base: BaseRow[][] = [[
      baseRow("hofer", "Salz fein", 55, "learned", 1000),
      baseRow("hofer", "Salz", 49, "manual", 1000),
    ], []];
    const { byKey } = resolveFromData({ needs: n, offers: new Map(), base, retailerIds: ["hofer", "spar"], names, logos });
    const hofer = byKey.get("salz")!.find((o) => o.retailer_id === "hofer")!;
    expect(hofer).toMatchObject({ price_source: "manual", price_cents: 49, is_on_sale: false });
    expect(byKey.get("salz")!.find((o) => o.retailer_id === "spar")!.price_source).toBe("estimate");
  });

  it("ignoriert Händler außerhalb der Auswahl", () => {
    const { byKey } = resolveFromData({ needs: n, offers, base: [[], []], retailerIds: ["hofer"], names, logos });
    expect(byKey.get("mehl")!.every((o) => o.retailer_id === "hofer")).toBe(true);
  });
});

describe("Gesamtkosten & Stopps", () => {
  const needs = [need("Salz", 1000, "mass"), need("Mehl", 1000, "mass"), need("Butter", 250, "mass")];
  // Billa: Butter im Angebot (sehr günstig), sonst teurer; Hofer: alles Regalpreis
  const offers = new Map<string, MatchedOffer[]>([["butter", [offer("billa", 149, "Butter", { pack_amount: 250, pack_dimension: "mass" })]]]);
  const { byKey } = resolveFromData({ needs, offers, base: [[], [], []], retailerIds: ["hofer", "billa"], names, logos });
  const options = buildOptions(needs, byKey);

  it("Summe je Markt über alle Zutaten (Angebot + Regalpreis)", () => {
    const cmp = retailerComparison(needs, options);
    const hofer = cmp.find((r) => r.retailerId === "hofer")!, billa = cmp.find((r) => r.retailerId === "billa")!;
    expect(hofer.totalCents).toBe(79 + 129 + 279);
    expect(billa.totalCents).toBe(89 + 149 + 149); // Salz/Mehl: Richtwert x 1,18 auf xx9 gerundet, Butter: Aktion
    expect(billa.onSaleCount).toBe(1);
    expect(hofer.missingCount + billa.missingCount).toBe(0);
  });

  it("Ein-Stopp wählt den insgesamt günstigsten Markt, nicht den mit den meisten Angeboten", () => {
    const one = optimize(needs, options, { maxStores: 1, savingsWeight: 0 });
    const cmp = retailerComparison(needs, options);
    expect(one.stores).toHaveLength(1);
    expect(one.stores[0].retailerId).toBe(cmp[0].retailerId);
    expect(one.totalCents).toBe(cmp[0].totalCents);
  });

  it("Stopp-Pauschale: zweiter Markt nur, wenn er die Pauschale spart", () => {
    const small = planAll(needs, options, { stopPenaltyCents: 5000, savingsWeight: 0 });
    expect(small.find((p) => p.strategy === "comfort")!.stores).toHaveLength(1);
    const ins = stopInsight(small[0], small.find((p) => p.strategy === "two-stops")!, 5000);
    expect(ins.worthIt).toBe(false);
    const free = stopInsight(small[0], small.find((p) => p.strategy === "two-stops")!, 1);
    expect(free.savingsCents).toBe(ins.savingsCents);
  });

  it("Plan weist Aktions- und geschätzte Posten aus", () => {
    const p = optimize(needs, options, { maxStores: null, savingsWeight: 0 });
    expect(p.onSaleCount).toBe(1);
    expect(p.estimatedCount).toBe(2);
    expect(p.estimatedCents).toBeGreaterThan(0);
    expect(p.estimatedCents).toBeLessThan(p.totalCents);
  });
});
