import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { BasePriceRow } from "../types";
import { Button, Notice, inputCls } from "./ui";

const RETAILERS = [["hofer", "HOFER"], ["lidl", "Lidl"], ["penny", "PENNY"], ["billa", "BILLA"], ["billa-plus", "BILLA PLUS"], ["spar", "SPAR"], ["eurospar", "EUROSPAR"], ["interspar", "INTERSPAR"], ["mpreis", "MPREIS"]];

/** Regalpreise ansehen und korrigieren. Eigene Werte werden nie von gelernten Streichpreisen überschrieben. */
export function BasePrices() {
  const [rows, setRows] = useState<BasePriceRow[] | null>(null);
  const [retailer, setRetailer] = useState("hofer");
  const [product, setProduct] = useState("");
  const [pack, setPack] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const load = useCallback(() => api.basePrices().then(setRows).catch((e: Error) => setMsg({ tone: "error", text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price.replace(",", "."));
    if (!product.trim() || !(p > 0)) return setMsg({ tone: "error", text: "Produkt und Preis (z. B. 1,29) angeben." });
    try { await api.putBasePrice({ retailer, product: product.trim(), pack: pack.trim() || undefined, price: p }); setProduct(""); setPack(""); setPrice(""); setMsg({ tone: "info", text: "Regalpreis gespeichert." }); load(); }
    catch (err) { setMsg({ tone: "error", text: (err as Error).message }); }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl">Regalpreise</h2>
      <p className="text-sm text-muted-foreground">Fehlt ein Preis, rechnet die App mit Richtwerten (als „geschätzt“ markiert). Hier trägst du echte Regalpreise ein; Streichpreise aus Aktionen werden automatisch gelernt.</p>
      <form onSubmit={save} className="grid gap-2 sm:grid-cols-[9rem_1fr_7rem_6rem_auto]">
        <select aria-label="Markt" className={inputCls} value={retailer} onChange={(e) => setRetailer(e.target.value)}>{RETAILERS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <input aria-label="Produkt" className={inputCls} placeholder="Produkt, z. B. Mehl universal" value={product} onChange={(e) => setProduct(e.target.value)} />
        <input aria-label="Packung" className={inputCls} placeholder="1 kg" value={pack} onChange={(e) => setPack(e.target.value)} />
        <input aria-label="Preis in Euro" className={inputCls} inputMode="decimal" placeholder="1,29" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Button type="submit">Speichern</Button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {rows && rows.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Gespeicherte Regalpreise ({rows.length})</summary>
          <ul className="mt-3 divide-y divide-border text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-2">
                <span className="w-20 shrink-0 font-semibold">{r.retailer_name ?? r.retailer_id}</span>
                <span className="min-w-0 flex-1 truncate">{r.product_name}{r.description ? ` · ${r.description}` : ""}</span>
                <span className="tabular-nums">{(r.price_cents / 100).toFixed(2).replace(".", ",")} €</span>
                <span className="w-14 text-xs text-muted-foreground">{r.source === "manual" ? "eigen" : "gelernt"}</span>
                <Button variant="ghost" size="icon" aria-label="Löschen" onClick={async () => { await api.deleteBasePrice(r.id); load(); }}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
