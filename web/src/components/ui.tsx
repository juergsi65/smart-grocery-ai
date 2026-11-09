import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary", className = "", ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "tag" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const v = {
    primary: "bg-ink text-paper hover:bg-[#22382f]",
    ghost: "border border-line bg-card text-ink hover:bg-mint",
    tag: "bg-tag text-white hover:bg-tag-dark",
  }[variant];
  return <button {...p} className={`${base} ${v} ${className}`} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-soft mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-line bg-card px-3 py-2.5 text-base placeholder:text-ink-soft/60";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "warn"; children: ReactNode }) {
  const c = { info: "bg-mint", error: "bg-[#f7d9d7] text-tag-dark", warn: "bg-mark/60" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return <p className="text-sm text-ink-soft py-6" role="status">{label}</p>;
}
