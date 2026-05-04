-- 0035_lb_slides_config
--
-- Creates the lb_slides_config single-row table for the LB Slide Deck
-- portfolio investor presentation (6 slides, one per L+B portfolio company).
--
-- Slides 1/2/3/5 reference admin-selected properties (nullable until assigned).
-- Slides 4 and 6 are auto-generated (portfolio grid / 10-year aggregate) and
-- require no FK here.
--
-- id is always 1 — the table is upserted rather than appended.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lb_slides_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  slide1_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide2_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide3_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide5_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
