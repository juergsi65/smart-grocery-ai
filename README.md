# Smart Grocery AI — Cookidoo Angebots- & Einkaufsoptimierer (AT)

Verbindet **Cookidoo** mit oesterreichischen Supermarktangeboten und erzeugt die
intelligenteste, realistische Einkaufsliste — Fokus auf Komfort, nicht nur
niedrigstem Preis. Laeuft self-hosted (Docker) und ist auf Oesterreich (de-AT)
optimiert.

## Status

Modular aufgebaut, iterativer Bau. Aktuell fertig:

- [x] **Phase 1 — `cookidoo`-Modul** (`api/app/modules/cookidoo/`): Login,
      Wochenplan, Rezeptdetails, **Rezepte kombinieren + Mengen zusammenrechnen**,
      Einkaufsliste. 14 Tests gruen, 8 API-Endpunkte, OpenAPI unter `/docs`.
- [ ] Phase 2 — `offers`: Angebots-Ingestion, alle AT-Quellen als Spikes
      (marktguru, Haendler-JSON, Flugblatt-PDF) — Quelle wird am Ende entschieden.
- [ ] Phase 3 — `matching` (KI: Zutat → Produkt), `optimizer` (Einkaufsstrategien).
- [ ] Phase 4 — Frontend (React/TS/Tailwind/shadcn), Dashboard, Karte, Liste.
- [ ] Phase 5 — Multi-User/Familie, Benachrichtigungen, Admin.

Details & Start: siehe [`api/README.md`](api/README.md).

## Schnellstart

```bash
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

## Hinweis

`cookidoo-api` ist inoffiziell/reverse-engineered und fuer **privaten**
Self-Hosted-Betrieb gedacht. Ein privates Repo wird empfohlen.
