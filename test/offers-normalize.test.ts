import { describe, expect, it } from "vitest";
import { lexicalScore } from "../src/matching/lexical";
import { fold, parsePack, tokens, unitPriceCents } from "../src/offers/normalize";

describe("parsePack", () => {
  it("einfache Massen", () => expect(parsePack("Mozzarella 125 g")).toEqual({ amount: 125, dimension: "mass" }));
  it("kg", () => expect(parsePack("Kartoffeln 1,5kg")).toEqual({ amount: 1500, dimension: "mass" }));
  it("Multipack", () => expect(parsePack("Cola 6 x 0,33 l")).toEqual({ amount: 1980, dimension: "volume" }));
  it("Stueck", () => expect(parsePack("Eier 10 Stk")).toEqual({ amount: 10, dimension: "count" }));
  it("nichts", () => expect(parsePack("Gurke")).toEqual({ amount: null, dimension: null }));
});

describe("unitPriceCents", () => {
  it("Preis je kg", () => expect(unitPriceCents(199, { amount: 500, dimension: "mass" })).toEqual({ cents: 398, basis: "kg" }));
});

describe("tokens/fold", () => {
  it("faltet Umlaute", () => expect(fold("Käse Größe")).toBe("kaese groesse"));
  it("ignoriert Stopwoerter", () => expect(tokens("frische rote Zwiebeln")).toContain("rote"));
});

describe("lexicalScore", () => {
  const o = (n: string) => ({ product_name: n, brand: null });
  it("Kompositum passt", () => expect(lexicalScore("Tomaten", o("Cocktailtomaten 250 g"))).toBeGreaterThanOrEqual(0.85));
  it("Ketchup ist kein sicherer Treffer", () => expect(lexicalScore("Tomaten", o("Tomaten Ketchup"))).toBeLessThan(0.85));
  it("kein Treffer", () => expect(lexicalScore("Tomaten", o("Butter"))).toBe(0));
});

import { fallbackAccept, headMatches, looksProcessed, STRONG } from "../src/matching/lexical";

describe("lexical (Beschreibungswoerter, verarbeitet)", () => {
  const o = (n: string) => ({ product_name: n, brand: null });
  it("'Tomaten rot' ist starker Treffer fuer Tomaten", () => expect(lexicalScore("Tomaten", o("Tomaten rot"))).toBeGreaterThanOrEqual(STRONG));
  it("'Mehl Type 480 universal' ist starker Treffer fuer Mehl", () => expect(lexicalScore("Mehl", o("Mehl Type 480 universal"))).toBeGreaterThanOrEqual(STRONG));
  it("Ketchup bleibt schwach", () => expect(lexicalScore("Tomaten", o("Tomaten Ketchup"))).toBeLessThan(STRONG));
  it("erkennt verarbeitete Produkte", () => {
    expect(looksProcessed("Tomaten Ketchup")).toBe(true);
    expect(looksProcessed("Mozzarella Kugeln")).toBe(false);
  });
  it("headMatches: Produktkern vorn", () => {
    expect(headMatches("Mozzarella", "Mozzarella Kugeln")).toBe(true);
    expect(headMatches("Tomaten", "Bio Tomaten Ketchup")).toBe(true);
    expect(headMatches("Kugeln", "Mozzarella Kugeln")).toBe(false);
  });
  it("Fallback: Kugeln ja, Ketchup/Pizza nein", () => {
    expect(fallbackAccept("Mozzarella", o("Mozzarella Kugeln"))).toBe(true);
    expect(fallbackAccept("Tomaten", o("Tomaten Ketchup"))).toBe(false);
    expect(fallbackAccept("Mozzarella", o("Pizza Mozzarella"))).toBe(false);
  });
});

describe("looksProcessed mit Zutatenname", () => {
  it("Zutat Ketchup darf Ketchup matchen", () => {
    expect(looksProcessed("Heinz Ketchup", "Ketchup")).toBe(false);
    expect(looksProcessed("Heinz Ketchup", "Tomaten")).toBe(true);
  });
});
