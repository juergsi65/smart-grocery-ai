/** Preis im Flugblatt-Stil: Euro gross, Cent hochgestellt. */
export function Price({ cents, size = "md", strike = false }: { cents: number; size?: "sm" | "md" | "lg"; strike?: boolean }) {
  const euro = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  const big = size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-lg";
  const small = size === "lg" ? "text-xl" : size === "md" ? "text-base" : "text-[0.65rem]";
  return (
    <span
      className={`font-display inline-flex items-start leading-none tabular-nums ${big} ${strike ? "text-muted-foreground line-through decoration-discount decoration-2" : ""}`}
      aria-label={`${euro},${rest} Euro`}
    >
      <span>{euro}</span>
      <sup className={`${small} font-extrabold ml-0.5 top-0`}>{rest}</sup>
    </span>
  );
}

export const eur = (cents: number): string =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(cents / 100);
