-- Regulaere Regalpreise je Haendler (Normalpreise). source: learned = aus Streichpreisen von Aktionen, manual = vom Benutzer.
-- Richtwerte (geschaetzt) liegen im Code (src/pricing/reference.ts) und werden nicht gespeichert.
CREATE TABLE base_prices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  retailer_id      TEXT NOT NULL,
  product_key      TEXT NOT NULL,         -- fold(Produktname) | Packungsgroesse
  product_name     TEXT NOT NULL,
  search_text      TEXT NOT NULL,
  brand            TEXT,
  description      TEXT,
  price_cents      INTEGER NOT NULL,      -- Normalpreis je Packung
  unit_price_cents INTEGER,
  unit_price_basis TEXT,
  pack_amount      REAL,
  pack_dimension   TEXT,
  source           TEXT NOT NULL,         -- learned | manual
  updated_at       INTEGER NOT NULL,
  UNIQUE (retailer_id, product_key)
);
CREATE INDEX idx_base_retailer ON base_prices(retailer_id);
