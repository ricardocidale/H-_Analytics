-- Migration: add global copy fields for auto-generated LB slides 4 and 6
-- slide4_section_subtitle: optional subtitle below the portfolio grid header
-- slide6_disclaimer:       optional disclaimer in the income-statement callout box

ALTER TABLE lb_slides_config
  ADD COLUMN IF NOT EXISTS slide4_section_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS slide6_disclaimer TEXT;
