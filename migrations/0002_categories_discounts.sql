-- Regal-Kategorie, Rabatt in Prozent und Haendler-Logo
ALTER TABLE offers ADD COLUMN category TEXT;
ALTER TABLE offers ADD COLUMN discount_pct INTEGER;
ALTER TABLE retailers ADD COLUMN logo_url TEXT;
CREATE INDEX idx_offers_category ON offers(category);
CREATE INDEX idx_offers_discount ON offers(discount_pct);
