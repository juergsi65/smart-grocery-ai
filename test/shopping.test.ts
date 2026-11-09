import { describe, expect, it } from "vitest";
import { AddItemSchema, ImportSchema, PatchItemSchema, splitQuantity } from "../src/shopping/schemas";
import { mapCookidooList } from "../src/shopping/routes";

describe("PatchItemSchema", () => {
  it("akzeptiert is_bought / in_pantry", () => {
    expect(PatchItemSchema.safeParse({ is_bought: true }).success).toBe(true);
    expect(PatchItemSchema.safeParse({ in_pantry: false }).success).toBe(true);
  });
  it("lehnt leere Payloads, falsche Typen und unbekannte Felder ab", () => {
    expect(PatchItemSchema.safeParse({}).success).toBe(false);
    expect(PatchItemSchema.safeParse({ is_bought: "ja" }).success).toBe(false);
    expect(PatchItemSchema.safeParse({ is_bought: true, name: "x" }).success).toBe(false);
  });
});

describe("AddItemSchema / ImportSchema", () => {
  it("validiert Name", () => {
    expect(AddItemSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(AddItemSchema.safeParse({ name: "Mehl", description: "500 g" }).success).toBe(true);
  });
  it("verlangt recipeIds nur für recipes", () => {
    expect(ImportSchema.safeParse({ source: "cookidoo-list" }).success).toBe(true);
    expect(ImportSchema.safeParse({ source: "recipes" }).success).toBe(false);
    expect(ImportSchema.safeParse({ source: "recipes", recipeIds: ["r1"] }).success).toBe(true);
  });
});

describe("mapCookidooList", () => {
  const list = mapCookidooList(
    [
      { name: "Mehl", description: "200 g", isOwned: true },
      { name: "Mehl", description: "300 g", isOwned: true },
      { name: "Tomaten", description: "400 g", isOwned: false },
      { name: "Tomaten", description: "100 g", isOwned: true },
      { name: "Butter", description: "50 g", isOwned: false },
    ],
    [{ name: "Küchenrolle", isOwned: true }],
  );
  const by = (k: string) => list.find((i) => i.need.key === k)!;

  it("führt gleiche Zutaten zusammen und summiert Mengen", () => {
    expect(by("mehl").need.amount).toBe(500);
    expect(by("tomaten").need.amount).toBe(500);
    expect(list).toHaveLength(4);
  });
  it("mappt abgehakte Cookidoo-Zutaten auf is_bought (nur wenn ALLE Zeilen abgehakt)", () => {
    expect(by("mehl").isBought).toBe(true);
    expect(by("tomaten").isBought).toBe(false);
    expect(by("butter").isBought).toBe(false);
    expect(by("küchenrolle").isBought).toBe(true);
  });
  it("kennzeichnet die Quelle", () => expect(list.every((i) => i.source === "cookidoo")).toBe(true));
});

describe("splitQuantity", () => {
  it.each([
    ["500 g Mehl", "Mehl", "500 g"],
    ["2 Zwiebeln", "Zwiebeln", "2"],
    ["1,5 l Milch", "Milch", "1,5 l"],
    ["Tomaten", "Tomaten", ""],
    ["3-4 EL Olivenöl", "Olivenöl", "3-4 EL"],
  ])("%s", (inp, name, desc) => expect(splitQuantity(inp)).toEqual({ name, description: desc }));
});
