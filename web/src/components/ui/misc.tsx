import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 rounded-2xl border border-border bg-card px-4 py-2.5 text-base placeholder:text-muted-foreground/70 focus-visible:outline-offset-0";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "warn"; children: ReactNode }) {
  const c = {
    info: "bg-secondary text-secondary-foreground",
    error: "bg-discount/15 text-discount",
    warn: "bg-accent text-accent-foreground",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-2xl px-4 py-3 text-sm", c)}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return <p className="py-6 text-sm text-muted-foreground" role="status">{label}</p>;
}
