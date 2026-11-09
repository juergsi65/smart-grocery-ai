import { useState } from "react";
import { api, session } from "../api";
import { Button, Field, Notice, inputCls } from "../components/ui";

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(email.trim(), password);
      session.set({ token: r.token, username: r.username });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid md:grid-cols-[1.1fr_1fr]">
      <div className="bg-ink text-paper p-8 md:p-14 flex flex-col justify-end">
        <h1 className="text-6xl md:text-8xl max-w-[10ch]">Einkaufen nach Angebot.</h1>
        <p className="mt-6 max-w-md text-paper/80">
          Deine Cookidoo-Rezepte, zusammengerechnet und mit den aktuellen Angeboten österreichischer Supermärkte abgeglichen.
        </p>
      </div>
      <div className="p-8 md:p-14 flex items-center">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-3xl">Mit Cookidoo anmelden</h2>
          <Field label="E-Mail">
            <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Passwort" hint="Das Passwort wird nur für die Anmeldung bei Cookidoo verwendet und nicht gespeichert.">
            <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Anmelden …" : "Anmelden"}</Button>
          <p className="text-xs text-ink-soft">
            Die Verbindung nutzt eine inoffizielle Cookidoo-Schnittstelle. Sie ist für den privaten Gebrauch gedacht und kann sich ohne Vorwarnung ändern.
          </p>
        </form>
      </div>
    </main>
  );
}
