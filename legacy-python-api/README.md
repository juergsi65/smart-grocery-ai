# Smart Grocery AI - Cookidoo-Modul (Phase 1)

Erstes Modul des Einkaufsoptimierers: Anbindung an **Cookidoo** ueber die
Open-Source-Bibliothek [`cookidoo-api`](https://github.com/miaucl/cookidoo-api)
(v0.17.2), auf **Oesterreich** (de-AT) vorkonfiguriert.

## Was drin ist

- **Login** am Cookidoo-Konto (OAuth2), Session-/Cookie-Handling, Token-Refresh.
- **Wochenplan** auslesen (Kalenderwoche mit Rezepten).
- **Rezeptdetails** inkl. strukturierter Zutaten.
- **Rezepte kombinieren + Mengen zusammenrechnen** - der Kern aus dem Brief.
- **Einkaufsliste** (native Cookidoo-Liste lesen + Rezeptzutaten uebernehmen).

### Der interessante Teil: Mengenlogik

Cookidoo liefert Zutaten als `name` + `description` (z. B. `"200 g"`,
`"1 - 2 EL"`), **ohne** getrennte Mengen-/Einheitsfelder. Das Modul parst diese
kontrollierten Strings zurueck (`quantity.py`) und fuehrt Zutaten deterministisch
zusammen (`aggregate.py`):

- summiert Kompatibles (`500 g` + `1 kg` -> `1,5 kg`),
- rechnet oesterreichisches **dag** (Deka) korrekt um,
- haelt Inkompatibles der gleichen Zutat getrennt (`400 g` + `2 Stk`),
- addiert Bereichsgrenzen (`1-2` + `2-3` -> `3-5`),
- sammelt qualitative Angaben (`Prise`, `etwas`) als Hinweise.

Semantische Synonyme (`Tomaten` == `Cocktailtomaten`) bleiben bewusst dem
spaeteren KI-Matching-Modul ueberlassen - diese Ebene ist rein deterministisch
und liefert die saubere Basis dafuer.

## Starten

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# Docs: http://localhost:8000/docs
```

Oder via Docker:

```bash
docker build -t smart-grocery-api .
docker run -p 8000:8000 smart-grocery-api
```

## Endpunkte (Prefix `/cookidoo`)

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/login` | Login, liefert `session_id` |
| DELETE | `/login` | Logout (Session + Cookies loeschen) |
| GET | `/me` | Konto-Info |
| GET | `/week?date=YYYY-MM-DD` | Wochenplan |
| GET | `/recipes/{id}` | Rezeptdetails + Zutaten |
| POST | `/combine` | Rezepte kombinieren + Mengen summieren |
| GET | `/shopping-list` | Einkaufsliste (roh + aggregiert) |
| POST | `/shopping-list/sync` | Rezeptzutaten in Cookidoo-Liste uebernehmen |

Alle Endpunkte ausser `/login` erwarten den Header `X-Cookidoo-Session`.

### Beispiel

```bash
# 1) Login
SID=$(curl -s -X POST localhost:8000/cookidoo/login \
  -H 'content-type: application/json' \
  -d '{"email":"du@cookidoo.at","password":"...","country":"at"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["session_id"])')

# 2) Wochenplan
curl -s localhost:8000/cookidoo/week -H "X-Cookidoo-Session: $SID"

# 3) Rezepte kombinieren
curl -s -X POST localhost:8000/cookidoo/combine \
  -H "X-Cookidoo-Session: $SID" -H 'content-type: application/json' \
  -d '{"recipe_ids":["r59322","r907015"]}'
```

## Tests

```bash
python tests/test_cookidoo_logic.py   # 14 Tests, ohne Netzwerk
```

## Bewusste Grenzen dieser Phase (kommt spaeter)

- **Auth ist PoC**: Sessions liegen im RAM, Passwoerter werden nicht persistiert.
  Ersetzt durch JWT + pro Benutzer verschluesselte Cookidoo-Credentials im
  `auth`/`users`-Modul.
- `cookidoo-api` ist **inoffiziell/reverse-engineered** - kann brechen, wenn
  Vorwerk das Backend aendert; nur fuer privaten Self-Hosted-Betrieb gedacht.

## Naechste Module

`offers` (Angebots-Ingestion: alle AT-Quellen prototypen), `matching` (KI:
Zutat -> Produkt), `optimizer` (Einkaufsstrategien), dann UI.
