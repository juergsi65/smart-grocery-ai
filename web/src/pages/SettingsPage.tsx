import { useEffect, useState } from "react";
import { api } from "../api";
import { DataTools } from "../components/DataTools";
import { Button, Field, Notice, Spinner, inputCls } from "../components/ui";
import type { Settings } from "../types";

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.settings().then(setS).catch((e: Error) => setMsg({ tone: "error", text: e.message })); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    try { await api.saveSettings(s); setMsg({ tone: "info", text: "Gespeichert." }); }
    catch (err) { setMsg({ tone: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-xl space-y-10">
      <h1 className="text-4xl">Einstellungen</h1>
      {!s ? (msg ? <Notice tone="error">{msg.text}</Notice> : <Spinner label="Einstellungen werden geladen …" />) : (
        <form onSubmit={save} className="space-y-5">
          <Field label="Postleitzahl" hint="Bestimmt, welche regionalen Angebote geladen werden.">
            <input className={inputCls} inputMode="numeric" pattern="\d{4,5}" value={s.zip} onChange={(e) => setS({ ...s, zip: e.target.value })} />
          </Field>
          <Field label="Maximale Anzahl Geschäfte pro Einkauf" hint="Die Märkte wählst du bei jedem Einkauf neu im Planer.">
            <input className={inputCls} type="number" min={1} max={5} value={s.maxStores} onChange={(e) => setS({ ...s, maxStores: Number(e.target.value) || 2 })} />
          </Field>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? "Speichern …" : "Speichern"}</Button>
        </form>
      )}
      <DataTools />
    </div>
  );
}
