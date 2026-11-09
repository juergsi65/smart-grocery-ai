/** Spiegel von src/categories.ts (Reihenfolge = Gang durch den Supermarkt). */
export const CATEGORIES = [
  { id: "obst-gemuese", name: "Obst & Gemüse", icon: "🥬" },
  { id: "brot-gebaeck", name: "Brot & Gebäck", icon: "🥖" },
  { id: "milch-eier", name: "Milch, Käse & Eier", icon: "🧀" },
  { id: "fleisch-fisch", name: "Fleisch, Wurst & Fisch", icon: "🥩" },
  { id: "tiefkuehl", name: "Tiefkühl", icon: "🧊" },
  { id: "vorrat", name: "Nudeln, Reis & Konserven", icon: "🍝" },
  { id: "oel-gewuerze", name: "Öl, Gewürze & Saucen", icon: "🫒" },
  { id: "suess-snacks", name: "Süßes & Snacks", icon: "🍫" },
  { id: "getraenke", name: "Getränke", icon: "🥤" },
  { id: "haushalt", name: "Haushalt & Drogerie", icon: "🧴" },
  { id: "sonstiges", name: "Sonstiges", icon: "🛒" },
] as const;

const BY_ID = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.id, c]));
export const categoryOf = (id: string | null | undefined) => BY_ID.get(id ?? "") ?? BY_ID.get("sonstiges")!;
