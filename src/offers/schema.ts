import { z } from "zod";

const isoDate = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null),
  z.string().nullable(),
);
const httpsUrl = z.preprocess((v) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null), z.string().nullable());

/** Validiertes Angebot (Pydantic-Aequivalent). Ungueltige Einzelangebote werden verworfen, nie der ganze Lauf. */
export const NormalizedOfferSchema = z
  .object({
    source: z.string().min(1),
    externalId: z.string().nullable(),
    retailerId: z.string().min(1).max(80),
    retailerName: z.string().min(1).max(120),
    productName: z.string().trim().min(1).max(200),
    brand: z.string().max(120).nullable(),
    description: z.string().max(300).nullable(),
    priceCents: z.number().int().positive().max(1_000_000),
    oldPriceCents: z.number().int().positive().max(1_000_000).nullable(),
    validFrom: isoDate,
    validTo: isoDate,
    imageUrl: httpsUrl,
    categoryHint: z.string().max(120).nullish(),
    retailerLogoUrl: httpsUrl.nullish(),
  })
  // Streichpreis nur, wenn er wirklich hoeher ist; Gueltigkeit nur, wenn von <= bis.
  .transform((o) => ({
    ...o,
    oldPriceCents: o.oldPriceCents && o.oldPriceCents > o.priceCents ? o.oldPriceCents : null,
    validFrom: o.validFrom && o.validTo && o.validFrom > o.validTo ? null : o.validFrom,
  }));
