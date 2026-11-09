import { describe, expect, it } from "vitest";
import { categorize, categoryOrder, discountPct } from "../src/categories";

describe("categorize", () => {
  const cases: [string, string][] = [
    ["Cocktailtomaten 250 g", "obst-gemuese"],
    ["Bananen Bio", "obst-gemuese"],
    ["Mozzarella Kugeln", "milch-eier"],
    ["Eier Freiland 10 Stk", "milch-eier"],
    ["Reis Basmati", "vorrat"],
    ["Spaghetti No. 5", "vorrat"],
    ["Mehl Type 480 universal", "vorrat"],
    ["Hühnerbrust Filet", "fleisch-fisch"],
    ["Tiefkühl Pizza Margherita", "tiefkuehl"],
    ["Speiseeis Vanille", "tiefkuehl"],
    ["Olivenöl nativ extra", "oel-gewuerze"],
    ["Olivenöl extra vergine", "oel-gewuerze"],
    ["Wassermelone", "obst-gemuese"],
    ["Mineralwasser still", "getraenke"],
    ["Weintrauben weiß", "obst-gemuese"],
    ["Rotwein trocken", "getraenke"],
    ["Tomaten Ketchup", "oel-gewuerze"],
    ["Passierte Tomaten", "vorrat"],
    ["Kokosmilch", "vorrat"],
    ["Vollmilchschokolade", "suess-snacks"],
    ["Coca-Cola 1,5 l", "getraenke"],
    ["Orangensaft", "getraenke"],
    ["Waschmittel Pulver", "haushalt"],
    ["Toastbrot", "brot-gebaeck"],
    ["Semmeln", "brot-gebaeck"],
  ];
  for (const [name, cat] of cases) it(`${name} -> ${cat}`, () => expect(categorize(name)).toBe(cat));

  it("Reis ist nicht Eis", () => expect(categorize("Reis")).not.toBe("tiefkuehl"));
  it("Hinweis der Quelle greift nur ohne Namenstreffer", () => {
    expect(categorize("Wunderding XL", "Drogerie & Kosmetik")).toBe("haushalt");
    expect(categorize("Cocktailtomaten", "Drogerie")).toBe("obst-gemuese");
  });
  it("unbekannt -> sonstiges", () => expect(categorize("Xyzzy")).toBe("sonstiges"));
  it("Regal-Reihenfolge", () => expect(categoryOrder("obst-gemuese")).toBeLessThan(categoryOrder("haushalt")));
});

describe("discountPct", () => {
  it("rechnet Prozent", () => expect(discountPct(199, 279)).toBe(29));
  it("ohne Streichpreis null", () => expect(discountPct(199, null)).toBeNull());
  it("Streichpreis <= Preis null", () => expect(discountPct(199, 199)).toBeNull());
});
