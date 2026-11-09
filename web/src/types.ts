export interface Quantity { low: number | null; high: number | null; unit: string | null; dimension: string; raw: string }
export interface Amount { unit: string | null; dimension: string; low: number; high: number; display: string }
export interface Aggregated {
  name: string; amounts: Amount[]; qualitativeNotes: string[];
  sourceRecipeIds: string[]; sourceRecipeNames: string[]; display: string;
}
export interface RecipeRef { id: string; name: string; totalTime: number | null; thumbnail: string | null; url: string }
export interface WeekDay { id: string; title: string; recipes: RecipeRef[] }
export interface CombineResponse {
  recipes: { id: string; name: string; totalTime: number | null; url: string }[];
  items: Aggregated[]; unmergedCount: number;
}
export interface ShoppingListResponse {
  items: { id: string; name: string; isOwned: boolean; quantity: Quantity | null; kind: string }[];
  aggregated: Aggregated[];
}
export interface OfferRow {
  id: number; retailer_id: string; retailer_name?: string; product_name: string; brand: string | null;
  description: string | null; price_cents: number; old_price_cents: number | null;
  unit_price_cents: number | null; unit_price_basis: string | null;
  pack_amount: number | null; valid_to: string | null; image_url: string | null;
  category: string | null; discount_pct: number | null; retailer_logo?: string | null;
}
export interface PlanOption {
  offer: OfferRow & { via?: string };
  packs: number; costCents: number; savingsCents: number; wastePct: number | null;
}
export interface PlanItem { key: string; name: string; display: string; category: string; option: PlanOption }
export interface PlanStore { retailerId: string; retailerName: string; items: PlanItem[]; subtotalCents: number }
export interface Plan {
  strategy: string; label: string; stores: PlanStore[];
  uncovered: { key: string; name: string; display: string; category: string }[];
  totalCents: number; savingsCents: number; coveredCount: number; totalCount: number;
}
export interface OptimizeResponse {
  recipes: unknown[]; ingredientCount: number;
  matching: { ingredients: number; withOffers: number; aiTasks: number; aiAccepted: number; fallbackAccepted: number };
  refresh: null | { offers?: number; termsFailed?: number; firstError?: string; error?: string };
  plans: Plan[];
}
export interface OfferStats {
  activeOffers: number;
  retailers: { id: string; name: string | null; n: number }[];
  recentRuns: { source: string; started_at: number; ok: number; count: number; message: string | null }[];
}
export interface Settings { zip: string; maxStores: number; preferredRetailers: string[]; excludedRetailers: string[] }

export interface RetailerFacet { id: string; name: string | null; logo: string | null; n: number; max_discount: number | null }
export interface BrowseResponse {
  offers: OfferRow[]; total: number; limit: number; offset: number;
  categories: { id: string; n: number }[];
  retailers: RetailerFacet[];
}
export type Sort = "discount" | "price" | "unit";
