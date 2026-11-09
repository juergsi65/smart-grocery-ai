import { useEffect, useState } from "react";
import { api } from "../api";
import { Price } from "../components/Price";
import { Button, Notice, inputCls } from "../components/ui";
import type { OfferRow, OfferStats } from "../types";

const EXAMPLE = `[
  { "retailer": "billa", "retailerName": "BILLA", "product": "Cocktailtomaten", "description": "250 g",
    "price": 1.99, "oldPrice": 2.79, "validTo": "2026-11-18" }
]`;

export function Offers() {
  const [stats, setStats] = useState<OfferStats | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OfferRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error" | "warn"; text: string } | null>(null);
  const [json, setJson] = useState("");

  const loadStats = () => api.offerStats().then(setStats).catch((e: Error) => setMsg({ tone: "error", text: e.message }));
  useEffect(() => { loadStats(); }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy("search");
    try { setRows(await api.offerSearch(q)); setMsg(null); } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(null); }
  }

  async function refresh() {
    setBusy("refresh");
    setMsg(null);
    let total = 0, failed = 0, firstError: string | undefined;
    try {
      for (let chunk = 0; chunk < 3; chunk++) {
        try {
          const r = await api.offerRefresh(chunk);
          total += r.offers; failed += r.termsFailed; firstError ??= r.firstError;
        } catch (e) { firstError ??= (e as Error).message; failed++; }
      }
      setMsg(total > 0
        ? { tone: failed ? "warn" : "info", text: `${total} Angebote aktualisiert${failed ? `, ${failed} Suchbegriffe sind fehlgeschlagen` : ""}.` }
        : { tone: "error", text: `Es konnten keine Angebote geladen werden${firstError ? ` (${firstError})` : ""}. Importiere Angebote stattdessen als JSON.` });
      loadStats();
    } finally { setBusy(null); }
  }

  async function doImport() {
    setBusy("import");
    try {
      const parsed = JSON.parse(json);
      const r = await api.offerImport(Array.isArray(parsed) ? parsed : parsed.offers);
      setMsg({ tone: r.skipped ? "warn" : "info", text: `${r.imported} Angebote importiert${r.skipped ? `, ${r.skipped} übersprungen (${r.errors[0]})` : ""}.` });
      loadStats();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof SyntaxError ? "Das ist kein gültiges JSON." : (e as Error).message });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-4xl mb-4">Angebote</h2>
        {stats && (
          <div className="flex flex-wrap gap-x-10 gap-y-3 items-end">
            <div>
              <div className="font-display text-5xl tabular-nums">{stats.activeOffers}</div>
              <div className="text-sm text-ink-soft">aktuell gültige Angebote</div>
            </div>
            {stats.retailers.map((r) => (
              <div key={r.id}>
                <div className="font-display text-2xl tabular-nums">{r.n}</div>
                <div className="text-sm text-ink-soft">{r.name ?? r.id}</div>
              </div>
            ))}
          </div>
        )}
        {stats && stats.activeOffers === 0 && (
          <div className="mt-4"><Notice>Noch keine Angebote gespeichert. Lade sie von Marktguru oder importiere eigene.</Notice></div>
        )}
        <div className="mt-5 flex flex-wrap gap-3 items-center">
          <Button onClick={refresh} disabled={busy !== null}>{busy === "refresh" ? "Wird geladen …" : "Angebote von Marktguru laden"}</Button>
          <span className="text-xs text-ink-soft">Läuft zusätzlich täglich automatisch.</span>
        </div>
        {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </section>

      <section>
        <h3 className="text-2xl mb-3">Angebote suchen</h3>
        <form onSubmit={search} className="flex gap-3 max-w-lg">
          <input aria-label="Suchbegriff" className={inputCls} placeholder="z. B. Mozzarella" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="ghost" disabled={busy !== null}>Suchen</Button>
        </form>
        {rows && rows.length === 0 && <p className="mt-4 text-sm text-ink-soft">Keine Angebote zu „{q}“ gefunden.</p>}
        {rows && rows.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((o) => (
              <li key={o.id} className="rounded-md border border-line bg-card p-4 flex gap-3 justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-tag-dark">{o.retailer_name ?? o.retailer_id}</div>
                  <div className="font-semibold leading-snug">{o.product_name}</div>
                  <div className="text-sm text-ink-soft">{o.description}</div>
                  {o.unit_price_cents && <div className="text-xs text-ink-soft mt-1">{(o.unit_price_cents / 100).toFixed(2).replace(".", ",")} € je {o.unit_price_basis}</div>}
                </div>
                <div className="text-right shrink-0">
                  <Price cents={o.price_cents} />
                  {o.old_price_cents && <div className="mt-1"><Price cents={o.old_price_cents} size="sm" strike /></div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-2xl mb-1">Angebote importieren</h3>
        <p className="text-sm text-ink-soft mb-3 max-w-xl">Füge eine JSON-Liste ein, zum Beispiel aus einem Händler-Flugblatt. Preise in Euro. So bleibt der Vergleich auch nutzbar, wenn Marktguru nicht erreichbar ist.</p>
        <textarea aria-label="Angebote als JSON" className={`${inputCls} min-h-40 font-mono text-sm`} value={json} onChange={(e) => setJson(e.target.value)} placeholder={EXAMPLE} />
        <div className="mt-3"><Button variant="ghost" onClick={doImport} disabled={busy !== null || !json.trim()}>{busy === "import" ? "Importieren …" : "Importieren"}</Button></div>
      </section>

      {stats && stats.recentRuns.length > 0 && (
        <section>
          <h3 className="text-2xl mb-3">Letzte Aktualisierungen</h3>
          <ul className="text-sm divide-y divide-line max-w-2xl">
            {stats.recentRuns.map((r, i) => (
              <li key={i} className="py-2 flex gap-4">
                <span className="w-40 shrink-0 text-ink-soft">{new Date(r.started_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="w-24 shrink-0">{r.source}</span>
                <span className={r.ok ? "" : "text-tag-dark"}>{r.ok ? `${r.count} Angebote` : "fehlgeschlagen"}{r.message ? ` · ${r.message}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
