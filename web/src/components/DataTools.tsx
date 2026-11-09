import { useEffect, useState } from "react";
import { api } from "../api";
import type { OfferStats } from "../types";
import { Button, Notice, inputCls } from "./ui";

const EXAMPLE = `[
  { "retailer": "billa", "retailerName": "BILLA", "product": "Cocktailtomaten", "description": "250 g",
    "price": 1.99, "oldPrice": 2.79, "validTo": "2026-11-18",
    "imageUrl": "https://…/tomaten.jpg", "category": "Gemüse" }
]`;

/** Angebotsdaten laden/importieren (frueher eigener Tab, jetzt Teil der Einstellungen). */
export function DataTools() {
  const [stats, setStats] = useState<OfferStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error" | "warn"; text: string } | null>(null);
  const [json, setJson] = useState("");
  const loadStats = () => api.offerStats().then(setStats).catch((e: Error) => setMsg({ tone: "error", text: e.message }));
  useEffect(() => { loadStats(); }, []);

  async function refresh() {
    setBusy("refresh"); setMsg(null);
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
    <section className="space-y-5">
      <h2 className="text-3xl">Angebotsdaten</h2>
      {stats && (
        <p className="text-sm text-ink-soft">
          <strong className="text-ink">{stats.activeOffers}</strong> gültige Angebote
          {stats.retailers.length ? ` bei ${stats.retailers.map((r) => `${r.name ?? r.id} (${r.n})`).join(", ")}` : ""}.
        </p>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <Button onClick={refresh} disabled={busy !== null}>{busy === "refresh" ? "Wird geladen …" : "Angebote von Marktguru laden"}</Button>
        <span className="text-xs text-ink-soft">Läuft zusätzlich täglich automatisch.</span>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <details className="rounded-md border border-line bg-card p-4">
        <summary className="cursor-pointer font-semibold">Angebote als JSON importieren</summary>
        <p className="text-sm text-ink-soft my-3 max-w-xl">Preise in Euro. Optional: <code>imageUrl</code>, <code>category</code>, <code>retailerLogo</code> (nur https).</p>
        <textarea aria-label="Angebote als JSON" className={`${inputCls} min-h-40 font-mono text-sm`} value={json} onChange={(e) => setJson(e.target.value)} placeholder={EXAMPLE} />
        <div className="mt-3"><Button variant="ghost" onClick={doImport} disabled={busy !== null || !json.trim()}>{busy === "import" ? "Importieren …" : "Importieren"}</Button></div>
      </details>
      {stats && stats.recentRuns.length > 0 && (
        <details className="rounded-md border border-line bg-card p-4">
          <summary className="cursor-pointer font-semibold">Letzte Aktualisierungen</summary>
          <ul className="text-sm divide-y divide-line mt-3">
            {stats.recentRuns.map((r, i) => (
              <li key={i} className="py-2 flex flex-wrap gap-x-4">
                <span className="text-ink-soft">{new Date(r.started_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{r.source}</span>
                <span className={r.ok ? "" : "text-tag-dark"}>{r.ok ? `${r.count} Angebote` : "fehlgeschlagen"}{r.message ? ` · ${r.message}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
