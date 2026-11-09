import { z } from "zod";

/** Einkaufslisten-Eintrag, wie ihn die API ausliefert. */
export const ShoppingListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  display: z.string(),
  category: z.string(),
  source: z.enum(["manual", "cookidoo", "recipes"]),
  is_bought: z.boolean(),
  in_pantry: z.boolean(),
  updated_at: z.number(),
});
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;

/** PATCH /items/:id - mindestens ein Flag, keine unbekannten Felder. */
export const PatchItemSchema = z
  .object({ is_bought: z.boolean().optional(), in_pantry: z.boolean().optional() })
  .strict()
  .refine((v) => v.is_bought !== undefined || v.in_pantry !== undefined, { message: "is_bought oder in_pantry erforderlich" });

export const AddItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(120).optional(),
});

export const ImportSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("cookidoo-list") }),
  z.object({ source: z.literal("recipes"), recipeIds: z.array(z.string()).min(1).max(30) }),
]);

/** "500 g Mehl" -> { description: "500 g", name: "Mehl" }; ohne fuehrende Menge bleibt der Name unveraendert. */
export function splitQuantity(text: string): { name: string; description: string } {
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|dag|l|ml|dl|cl|stk\.?|stück|el|tl|pkg\.?|packung(?:en)?|dosen?|bund|prise)?)\s+(\p{L}.*)$/iu);
  return m ? { description: m[1].trim(), name: m[2].trim() } : { name: text.trim(), description: "" };
}
