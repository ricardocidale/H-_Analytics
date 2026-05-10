-- 0049_users_tour_step_not_null.sql
--
-- Tightens the tour_step column added in 0048: sets a default of 0 and adds a
-- NOT NULL constraint. Existing NULL rows are backfilled to 0 first so the
-- NOT NULL alter cannot fail on rows written before 0048 ran.
--
-- Idempotent: the SET DEFAULT and NOT NULL operations are safe to re-apply.

-- Step 1: add default so future inserts without an explicit value get 0
ALTER TABLE "users" ALTER COLUMN "tour_step" SET DEFAULT 0;

-- Step 2: backfill any rows written before the default was present
UPDATE "users" SET "tour_step" = 0 WHERE "tour_step" IS NULL;

-- Step 3: enforce the constraint now that no NULLs remain
ALTER TABLE "users" ALTER COLUMN "tour_step" SET NOT NULL;
