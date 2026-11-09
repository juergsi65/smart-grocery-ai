export interface NormalizedOffer {
  source: string;
  externalId: string | null;
  retailerId: string;
  retailerName: string;
  productName: string;
  brand: string | null;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  imageUrl: string | null;
  /** Kategorie-Name der Quelle (nur Hinweis fuer die Zuordnung). */
  categoryHint?: string | null;
  retailerLogoUrl?: string | null;
}

export interface OfferRow {
  id: number;
  source: string;
  retailer_id: string;
  retailer_name?: string;
  product_name: string;
  brand: string | null;
  description: string | null;
  price_cents: number;
  old_price_cents: number | null;
  unit_price_cents: number | null;
  unit_price_basis: string | null;
  pack_amount: number | null;
  pack_dimension: "mass" | "volume" | "count" | null;
  valid_from: string | null;
  valid_to: string | null;
  image_url: string | null;
  category: string | null;
  discount_pct: number | null;
  retailer_logo?: string | null;
}

/** Eine Angebotsquelle. Mehrere Adapter koennen parallel existieren. */
export interface OfferSource {
  id: string;
  /** Sucht Angebote zu einem Begriff. Wirft bei Fehlern. */
  search(term: string, opts: { zip: string; limit?: number }): Promise<NormalizedOffer[]>;
}
