import { describe, expect, it } from "vitest";
import { aggregate, ingredientFromCookidoo as ing, normalizeName } from "../src/cookidoo/aggregate";
import { parseQuantity } from "../src/cookidoo/quantity";

describe("parseQuantity", () => {
  it("simple mass", () => {
    const q = parseQuantity("200 g");
    expect([q.low, q.high, q.unit, q.dimension]).toEqual([200, 200, "g", "mass"]);
    expect(q.baseLow).toBe(200);
  });
  it("kg to base", () => {
    const q = parseQuantity("1 kg");
    expect(q.unit).toBe("g");
    expect(q.baseLow).toBe(1000);
  });
  it("range", () => {
    const q = parseQuantity("1 - 2 EL");
    expect([q.low, q.high, q.dimension, q.unit]).toEqual([1, 2, "spoon", "EL"]);
  });
  it("decimal comma", () => {
    const q = parseQuantity("1,5 l");
    expect(q.unit).toBe("ml");
    expect(q.baseLow).toBe(1500);
  });
  it("dag (AT)", () => {
    const q = parseQuantity("25 dag");
    expect(q.dimension).toBe("mass");
    expect(q.baseLow).toBe(250);
  });
  it("qualitative None None", () => {
    const q = parseQuantity("None None");
    expect(q.low).toBeNull();
    expect(q.dimension).toBe("qualitative");
  });
  it("Prise", () => expect(parseQuantity("1 Prise").dimension).toBe("qualitative"));
  it("countable", () => {
    const q = parseQuantity("2 Zehen");
    expect([q.dimension, q.unit, q.low]).toEqual(["count", "Zehe", 2]);
  });
});

describe("aggregate", () => {
  it("normalizeName strips parenthetical", () => expect(normalizeName("Zwiebel (rot)")).toBe("zwiebel"));
  it("sums same unit", () => {
    const res = aggregate([ing("Mozzarella", "200 g", "r1", "Pizza"), ing("Mozzarella", "200 g", "r2", "Salat")]);
    expect(res).toHaveLength(1);
    expect(res[0].amounts[0]).toMatchObject({ low: 400, unit: "g" });
    expect(new Set(res[0].sourceRecipeIds)).toEqual(new Set(["r1", "r2"]));
  });
  it("mixes kg and g", () => {
    const res = aggregate([ing("Mehl", "500 g"), ing("Mehl", "1 kg")]);
    expect(res[0].amounts[0]).toMatchObject({ unit: "kg", low: 1.5 });
  });
  it("keeps incompatible separate", () => {
    const res = aggregate([ing("Tomaten", "400 g"), ing("Tomaten", "2 Stk")]);
    expect(res[0].amounts).toHaveLength(2);
  });
  it("ranges add bounds", () => {
    const res = aggregate([ing("Knoblauch", "1 - 2 Zehen"), ing("Knoblauch", "2 - 3 Zehen")]);
    expect(res[0].amounts[0]).toMatchObject({ low: 3, high: 5 });
  });
  it("collects qualitative notes", () => {
    const res = aggregate([ing("Salz", "None None"), ing("Salz", "1 Prise")]);
    expect(res[0].qualitativeNotes.length).toBeGreaterThan(0);
  });
});
