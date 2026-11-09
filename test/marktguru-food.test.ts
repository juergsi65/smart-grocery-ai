import { describe, expect, it } from "vitest";
import { isFoodRetailer, isNonFoodCategory } from "../src/offers/food";
import { parseMarktguruResults } from "../src/offers/marktguru";
import type { SourceStats } from "../src/offers/types";

const raw = (over: Record<string, unknown> = {}) => ({
  id: 1,
  price: 1.99,
  oldPrice: 2.49,
  product: { name: "Cocktailtomaten" },
  description: "250 g",
  advertisers: [{ id: 5, uniqueName: "billa", name: "BILLA" }],
  categories: [{ name: "Obst & Gemüse" }],
  validityDates: [{ from: "2026-11-09T00:00:00Z", to: "2026-11-18T00:00:00Z" }],
  ...over,
});

describe("isFoodRetailer", () => {
  it.each(["billa", "billa-plus", "spar", "eurospar", "interspar", "hofer", "lidl", "penny", "mpreis", "Billa Plus"])(
    "%s ist erlaubt", (n) => expect(isFoodRetailer(n)).toBe(true));
  it.each(["obi", "hornbach", "mediamarkt", "saturn", "sparkasse", "bauhaus", "ikea", "kika", "xxxlutz", "bipa"])(
    "%s wird ausgefiltert", (n) => expect(isFoodRetailer(n)).toBe(false));
  it("erkennt den Händler auch über den Anzeigenamen", () => expect(isFoodRetailer("x-123", "BILLA PLUS")).toBe(true));
});

describe("isNonFoodCategory", () => {
  it.each(["Elektronik & Multimedia", "Baumarkt", "Garten", "Mode & Accessoires", "Möbel", "Spielwaren"])(
    "%s -> true", (c) => expect(isNonFoodCategory(c)).toBe(true));
  it.each(["Obst & Gemüse", "Getränke", "Fleisch & Wurst", "Haushalt", null, undefined])(
    "%s -> false", (c) => expect(isNonFoodCategory(c as string)).toBe(false));
});

describe("parseMarktguruResults", () => {
  it("übernimmt gültige Lebensmittelangebote", () => {
    const [o] = parseMarktguruResults([raw()]);
    expect(o).toMatchObject({ retailerId: "billa", productName: "Cocktailtomaten", priceCents: 199, oldPriceCents: 249, validTo: "2026-11-18" });
  });

  it("filtert Nicht-Lebensmittel und fremde Händler und zählt sie", () => {
    const stats: SourceStats = { filtered: 0, invalid: 0 };
    const out = parseMarktguruResults(
      [
        raw(),
        raw({ id: 2, advertisers: [{ id: 9, uniqueName: "obi", name: "OBI" }] }),
        raw({ id: 3, categories: [{ name: "Elektronik" }] }),
      ],
      stats,
    );
    expect(out).toHaveLength(1);
    expect(stats).toEqual({ filtered: 2, invalid: 0 });
  });

  it("bricht bei fehlerhaften Einzelangeboten nicht ab", () => {
    const stats: SourceStats = { filtered: 0, invalid: 0 };
    const out = parseMarktguruResults(
      [null, raw({ id: 4, price: "kaputt" }), raw({ id: 5, product: {} }), raw({ id: 6, price: -1 }), raw({ id: 7 })],
      stats,
    );
    expect(out.map((o) => o.externalId)).toEqual(["7"]);
    expect(stats).toEqual({ filtered: 1, invalid: 3 }); // null hat keinen Händler -> gefiltert
  });

  it("verwirft unplausible Streichpreise und vertauschte Gültigkeit", () => {
    const [o] = parseMarktguruResults([
      raw({ oldPrice: 1.5, validityDates: [{ from: "2026-12-01", to: "2026-11-01" }] }),
    ]);
    expect(o.oldPriceCents).toBeNull();
    expect(o.validFrom).toBeNull();
  });

  it("liefert bei unerwarteter Antwortform eine leere Liste", () => {
    expect(parseMarktguruResults(undefined)).toEqual([]);
    expect(parseMarktguruResults({ foo: 1 })).toEqual([]);
  });
});
