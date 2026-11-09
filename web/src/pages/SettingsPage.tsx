import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Notice, Spinner, inputCls } from "../components/ui";
import type { OfferStats, Settings } from "../types";

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [stats, setStats] = useState<OfferStats | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings().then(setS).catch((e: Error) => setMsg({ tone: "error", text: e.message }));
    api.offerStats().then(setStats).catch(() => undefined);
  }, []);

  if (!s) return msg ? <Notice tone="error">{msg.text}</Notice> : <Spinner label="Einstellungen werden geladen …" />;

  const toggleExcluded = (id: string) =>
    setS({ ...s, excludedRetailers: s.excludedRetailers.includes(id) ? s.excludedRetailers.filter((x) => x !== id) : [...s.excludedRetailers, id] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    try {
      await api.saveSettings(s);
      setMsg({ tone: "info", text: "Einstellungen gespeichert." });
    } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-6">
      <h2 className="text-4xl">Einstellungen</h2>
      <Field label="Postleitzahl" hint="Bestimmt, welche regionalen Angebote geladen werden.">
        <input className={inputCls} inputMode="numeric" pattern="\d{4,5}" value={s.zip} onChange={(e) => setS({ ...s, zip: e.target.value })} />
      </Field>
      <Field label="Maximale Anzahl Geschäfte" hint="Zusätzlich zu „Ein Geschäft“, „Zwei Geschäfte“ und „Günstigste Einzelpreise“ wird eine Variante mit dieser Obergrenze berechnet (ab 3).">
        <input className={inputCls} type="number" min={1} max={5} value={s.maxStores} onChange={(e) => setS({ ...s, maxStores: Number(e.target.value) || 2 })} />
      </Field>
      <fieldset>
        <legend className="text-sm font-semibold mb-2">Diese Geschäfte nie verwenden</legend>
        {!stats || stats.retailers.length === 0 ? (
          <p className="text-sm text-ink-soft">Sobald Angebote geladen sind, erscheinen hier die Geschäfte.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.retailers.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[#14231f]" checked={s.excludedRetailers.includes(r.id)} onChange={() => toggleExcluded(r.id)} />
                {r.name ?? r.id}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button type="submit" disabled={busy}>{busy ? "Speichern …" : "Speichern"}</Button>
    </form>
  );
}
