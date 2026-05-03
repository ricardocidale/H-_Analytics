-- 0038_batch9_drop_company_fk.sql
--
-- Phase C batch 9: consolidate drop_company_fk_001.
-- Backfills users.company text from companies.name (where company_id was set),
-- then drops the company_id FK column and related constraint/index.
--
-- Already applied to live Neon DB via runtime gate.
-- Pre-marked via apply-0038-batch9-drop-company-fk-premark.mjs.

-- Backfill users.company from companies table (no-op on fresh DBs with no data)
UPDATE users u
  SET company = c.name
  FROM companies c
  WHERE u.company_id = c.id
    AND (u.company IS NULL OR u.company = '');
--> statement-breakpoint

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_id_companies_id_fk;
--> statement-breakpoint

DROP INDEX IF EXISTS users_company_id_idx;
--> statement-breakpoint

ALTER TABLE users DROP COLUMN IF EXISTS company_id;
