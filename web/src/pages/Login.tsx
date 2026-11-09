import { useState } from "react";
import { api, session } from "../api";
import { Button, Card, Field, Notice, inputCls } from "../components/ui";

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-secondary opacity-70 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-accent opacity-50 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-primary text-3xl shadow-lg" aria-hidden="true">🛒</div>
          <h1 className="text-4xl">Einkaufen nach Angebot</h1>
          <p className="mt-2 text-muted-foreground">Deine Cookidoo-Rezepte, abgeglichen mit den aktuellen Angeboten österreichischer Supermärkte.</p>
        </div>
        <Card className="glass p-6 shadow-xl">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl">Mit Cookidoo anmelden</h2>
            <Field label="E-Mail">
              <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Passwort" hint="Wird nur für die Anmeldung bei Cookidoo verwendet und nicht gespeichert.">
              <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Anmelden …" : "Anmelden"}</Button>
            <p className="text-xs text-muted-foreground">Die Verbindung nutzt eine inoffizielle Cookidoo-Schnittstelle für den privaten Gebrauch und kann sich ohne Vorwarnung ändern.</p>
          </form>
        </Card>
      </div>
    </main>
  );
}
