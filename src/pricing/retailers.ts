/**
 * Lebensmittelhaendler in AT mit Preisniveau relativ zum Diskonter-Richtwert (Hofer = 1.00).
 * Die Faktoren sind grobe Schaetzwerte fuer Standardsortiment, keine gemessenen Preise.
 */
export interface FoodRetailer {
  id: string;
  name: string;
  tier: "discount" | "supermarket";
  factor: number;
}

export const FOOD_RETAILERS: FoodRetailer[] = [
  { id: "hofer", name: "HOFER", tier: "discount", factor: 1.0 },
  { id: "lidl", name: "Lidl", tier: "discount", factor: 1.0 },
  { id: "penny", name: "PENNY", tier: "discount", factor: 1.08 },
  { id: "billa", name: "BILLA", tier: "supermarket", factor: 1.18 },
  { id: "billa-plus", name: "BILLA PLUS", tier: "supermarket", factor: 1.16 },
  { id: "spar", name: "SPAR", tier: "supermarket", factor: 1.18 },
  { id: "eurospar", name: "EUROSPAR", tier: "supermarket", factor: 1.14 },
  { id: "interspar", name: "INTERSPAR", tier: "supermarket", factor: 1.12 },
  { id: "mpreis", name: "MPREIS", tier: "supermarket", factor: 1.22 },
];

export const RETAILER_BY_ID = new Map(FOOD_RETAILERS.map((r) => [r.id, r]));
