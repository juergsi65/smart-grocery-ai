-- Persistente Einkaufsliste mit Status (gekauft / zu Hause vorhanden), je Benutzer.
CREATE TABLE shopping_items (
  id           TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,            -- Cookidoo-Benutzername (Fallback: Session-Hash)
  key          TEXT NOT NULL,            -- normalisierter Zutatenname
  name         TEXT NOT NULL,
  display      TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'sonstiges',
  amount       REAL,                     -- Bedarf in Basiseinheit (g / ml / Stk), obere Grenze
  dimension    TEXT,                     -- mass | volume | count
  source       TEXT NOT NULL DEFAULT 'manual',   -- manual | cookidoo | recipes
  is_bought    INTEGER NOT NULL DEFAULT 0,
  in_pantry    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (owner, key)
);
CREATE INDEX idx_shopping_owner ON shopping_items(owner);
