import { useState } from "react";
import { categoryOf } from "../lib/categories";

/** Produktfoto; bei fehlender/defekter URL das Kategorie-Icon. */
export function ProductImage({ src, category, className = "", iconSize = "text-4xl" }: {
  src: string | null | undefined; category: string | null | undefined; className?: string; iconSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  const cat = categoryOf(category);
  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-secondary/60 ${className}`} role="img" aria-label={cat.name}>
        <span className={iconSize} aria-hidden="true">{cat.icon}</span>
      </div>
    );
  }
  return (
    <div className={`bg-white grid place-items-center overflow-hidden ${className}`}>
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain" />
    </div>
  );
}

const initials = (name: string) => name.replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Haendler-Logo; sonst Initialen auf dunklem Grund. */
export function RetailerLogo({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span style={box} className="grid place-items-center rounded-full bg-primary text-primary-foreground text-[0.65rem] font-bold shrink-0" aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    <img src={src} alt="" style={box} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
      className="rounded-full bg-white object-contain border border-border shrink-0" />
  );
}
