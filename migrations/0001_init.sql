-- Sessions: Cookidoo-Cookies verschluesselt (AES-GCM), Token nur als SHA-256-Hash.
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  cookies_enc  TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'at',
  username     TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Haendler
CREATE TABLE retailers (
  id    TEXT PRIMARY KEY,         -- z. B. 'billa', 'spar'
  name  TEXT NOT NULL
);

-- Angebote (normalisiert aus beliebigen Quellen)
CREATE TABLE offers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,        -- 'marktguru' | 'import' | ...
  external_id   TEXT,                 -- ID in der Quelle (fuer Upsert)
  retailer_id   TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  search_text   TEXT NOT NULL,        -- normalisiert (lowercase, Umlaute gefaltet) fuer LIKE-Vorfilter
  brand         TEXT,
  description   TEXT,
  price_cents   INTEGER NOT NULL,     -- Angebotspreis in Cent
  old_price_cents INTEGER,
  unit_price_cents INTEGER,           -- Preis pro Basiseinheit (kg/l), falls ermittelbar
  unit_price_basis TEXT,              -- 'kg' | 'l' | 'Stk'
  pack_amount   REAL,                 -- Packungsgroesse in Basiseinheit (g/ml/Stk)
  pack_dimension TEXT,                -- 'mass' | 'volume' | 'count'
  valid_from    TEXT,                 -- ISO-Datum
  valid_to      TEXT,
  image_url     TEXT,
  fetched_at    INTEGER NOT NULL,
  UNIQUE(source, external_id)
);
CREATE INDEX idx_offers_valid ON offers(valid_to);
CREATE INDEX idx_offers_retailer ON offers(retailer_id);

-- Cache: KI-Entscheidung je (Zutat, Kandidatenmenge) -> akzeptierte Offer-IDs. Spart Neuronen im Free-Tier.
CREATE TABLE match_cache (
  ingredient_key     TEXT NOT NULL,
  offers_fingerprint TEXT NOT NULL,   -- Hash der Kandidaten-IDs
  accepted_ids       TEXT NOT NULL,   -- JSON-Array akzeptierter Offer-IDs (leer = kein passendes Angebot)
  created_at         INTEGER NOT NULL,
  PRIMARY KEY (ingredient_key, offers_fingerprint)
);

-- Ingestion-Log
CREATE TABLE ingest_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ok          INTEGER NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  message     TEXT
);

-- Nutzer-Einstellungen (pro Session-Konto = Cookidoo-Username)
CREATE TABLE settings (
  username   TEXT PRIMARY KEY,
  zip        TEXT,
  max_stores INTEGER NOT NULL DEFAULT 2,
  preferred_retailers TEXT,   -- JSON-Array
  excluded_retailers  TEXT    -- JSON-Array
);
