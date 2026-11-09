import type { OfferRow } from "../types";
import { Price } from "./Price";
import { ProductImage, RetailerLogo } from "./Media";

const dmy = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".") + ".";
const comma = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function OfferCard({ o }: { o: OfferRow }) {
  const retailer = o.retailer_name ?? o.retailer_id;
  return (
    <li className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage src={o.image_url} category={o.category} className="aspect-[4/3] w-full p-2" iconSize="text-5xl" />
        {o.discount_pct ? (
          <span className="absolute left-0 top-3 bg-discount text-white font-display text-lg px-2.5 py-1 rounded-r-md shadow-sm">
            −{o.discount_pct} %
          </span>
        ) : null}
        <span className="absolute right-2 top-2 rounded-full bg-white/90 p-0.5 shadow-sm">
          <RetailerLogo src={o.retailer_logo} name={retailer} size={28} />
        </span>
      </div>
      <div className="flex flex-col flex-1 p-3 pt-2.5">
        <div className="text-xs font-semibold text-primary">{retailer}</div>
        <h3 className="!font-semibold text-[0.95rem] leading-snug mt-0.5 line-clamp-2" style={{ fontStretch: "100%", letterSpacing: 0 }}>
          {o.product_name}
        </h3>
        {o.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{o.description}</p>}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <div className="flex items-start gap-1.5">
              <Price cents={o.price_cents} size="md" />
              <span className="font-display text-lg mt-0.5">€</span>
            </div>
            {o.unit_price_cents ? (
              <div className="text-[0.7rem] text-muted-foreground mt-1">{comma(o.unit_price_cents)} € je {o.unit_price_basis}</div>
            ) : null}
          </div>
          <div className="text-right">
            {o.old_price_cents ? <Price cents={o.old_price_cents} size="sm" strike /> : null}
            {o.valid_to ? <div className="text-[0.7rem] text-muted-foreground mt-1">bis {dmy(o.valid_to)}</div> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function OfferSkeleton() {
  return (
    <li className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse" aria-hidden="true">
      <div className="aspect-[4/3] bg-muted/60" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-1/3 bg-muted/70 rounded" />
        <div className="h-4 w-4/5 bg-muted/70 rounded" />
        <div className="h-8 w-1/2 bg-muted/70 rounded mt-4" />
      </div>
    </li>
  );
}
