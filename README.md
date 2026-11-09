# Smart Grocery AI — Cookidoo × österreichische Supermarktangebote

Verbindet **Cookidoo** (Wochenplan, Rezepte, Einkaufsliste) mit aktuellen Supermarktangeboten und rechnet aus,
wo man mit wenig Aufwand am besten einkauft. Läuft komplett auf **Cloudflare** (ein Worker + D1 + Workers AI).

## Architektur

| Teil | Technik |
|---|---|
| API | Cloudflare Worker, [Hono](https://hono.dev), TypeScript (`src/`) |
| Frontend | React + Vite + Tailwind (`web/`), vom selben Worker als Static Assets ausgeliefert |
| Daten | D1 (Sessions, Angebote, Einstellungen, KI-Cache) — Schema in `migrations/` |
| KI-Matching | Workers AI (`@cf/meta/llama-3.1-8b-instruct`), nur für mehrdeutige Zuordnungen, Ergebnisse in D1 gecacht |
| Cron | täglich 04:30/04:35/04:40 UTC: Angebote in 3 Chunks aktualisieren |

Module: `src/cookidoo/` (Login, Rezepte, Mengenlogik) · `src/offers/` (Quellen, Ingestion, Suche) ·
`src/matching/` (Zutat → Angebot) · `src/optimizer.ts` (Einkaufsstrategien) · `legacy-python-api/` (alte FastAPI-Phase-1, nur Referenz).

## Deployen

```bash
npm install
npx wrangler login
npx wrangler d1 create smart-grocery          # nur falls noch nicht vorhanden; ID in wrangler.toml eintragen
npm run db:migrate:remote                      # Schema in die Cloudflare-D1 einspielen
npx wrangler secret put SESSION_KEY            # beliebige zufällige Zeichenfolge, mind. 32 Zeichen
npm run deploy                                 # = wrangler deploy; baut dabei automatisch das Frontend ([build] in wrangler.toml)
```

Alternativ: Repo in Cloudflare (Workers Builds) verbinden. Build-Befehl kann leer bleiben, Deploy-Befehl `npx wrangler deploy` genügt — das Frontend wird über `[build]` in `wrangler.toml` gebaut. Vorher einmalig `npm run db:migrate:remote` und das Secret `SESSION_KEY` setzen (Worker → Settings → Variables and Secrets).

Lokal: `.dev.vars` mit `SESSION_KEY=...` anlegen, `npm run db:migrate:local`, `npm run dev` (API+Frontend auf :8787);
Workers AI läuft auch lokal nur remote — ohne Zugang greift automatisch der Regel-Fallback.

## Funktionsumfang

- **Cookidoo:** Login (Passwort wird nicht gespeichert, Cookies verschlüsselt in D1), Wochenplan, Rezepte kombinieren mit Mengenaddition (kg+g, dag, Bereiche), Cookidoo-Einkaufsliste lesen und Rezeptzutaten dorthin übernehmen.
- **Angebote:** Marktguru-Adapter (täglich per Cron + manuell), JSON-Import für beliebige Quellen, Suche, Packungsgröße und Grundpreis werden berechnet.
- **Matching:** Vorfilter in D1 → lexikalischer Score → mehrdeutige Fälle per Workers AI → Regel-Fallback, falls die KI nicht antwortet.
- **Optimizer:** „Ein Geschäft“, „Zwei Geschäfte“, „Günstigste Einzelpreise“ (+ eigene Obergrenze), Packungsanzahl, Verschnitt, Ersparnis laut Streichpreis, Zutaten ohne Angebot.
- **Frontend:** Anmeldung, Einkauf planen (Wochenplan / Cookidoo-Liste / eigene Liste), Angebote, Einstellungen.

## Bekannte Grenzen (ehrlich)

- Die **Cookidoo-Anbindung** (inoffiziell) und die **Marktguru-Schnittstelle** sind im Worker nachgebaut, aber hier nicht gegen die Live-Dienste getestet — beim ersten Echtlauf Login, Wochenplan und Angebots-Refresh prüfen.
- Workers AI wurde nicht gegen den echten Dienst getestet; Fehler fallen sauber auf die Regeln zurück.
- Workers **Free** erlaubt ~50 Subrequests pro Aufruf: der Angebots-Refresh ist deshalb auf 40 Suchbegriffe je Lauf begrenzt. Große Listen profitieren vom Paid-Plan.
- Preise gelten nur für Aktionsware; Zutaten ohne Angebot sind nicht eingerechnet.

## Tests

`npm test` — 40 Tests (Mengenlogik, Normalisierung, Matching, Optimizer).

## Angebote, Märkte & Kategorien

- Startseite ist die Angebotsübersicht (`GET /api/offers/browse`): Filter nach Märkten, Regal-Kategorien, Suche, Sortierung (Rabatt / Preis / Grundpreis), Facetten mit Anzahl.
- Märkte werden pro Einkauf gewählt (Chips mit Logo); die Auswahl wird lokal vorbelegt und geht als `retailers: string[]` an `POST /api/optimize`.
- Kategorien: `src/categories.ts` (Schlüsselwörter, Quelle-Hinweis nur als Fallback). Pläne sind je Markt nach Regal-Reihenfolge sortiert.
- Bilder/Logos werden von der Quelle verlinkt (Marktguru-CDN, unverifiziert für .at); bei Fehlern erscheinen Kategorie-Icon bzw. Initialen.
- Migration `0002_categories_discounts.sql` muss vor dem Deploy angewendet sein (`npm run db:migrate:remote`).
