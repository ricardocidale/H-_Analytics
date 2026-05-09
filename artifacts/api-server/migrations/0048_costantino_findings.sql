-- Costantino — Data Custodian (Step 0)
-- Creates findings table + seeds llm_slot + admin-editable cadence parameter row.
-- Cadence numeric literals match DEFAULT_COSTANTINO_*_MS in lib/shared/src/constants.ts:
--   value_ms = 432000000 = 5 * 24 * 60 * 60 * 1000  (DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS)
--   min_ms   = 60000     = 60 * 1000               (DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS)
--   max_ms   = 2592000000 = 30 * 24 * 60 * 60 * 1000 (DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS)
-- SQL files under artifacts/api-server/migrations/ are exempt from check:magic-numbers.

CREATE TABLE IF NOT EXISTS "costantino_findings" (
  "finding_id"   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind"         text        NOT NULL,
  "severity"     text        NOT NULL,
  "target_kind"  text        NOT NULL,
  "target_id"    text        NOT NULL,
  "description"  text        NOT NULL,
  "detected_at"  timestamptz NOT NULL DEFAULT now(),
  "resolved_at"  timestamptz,
  "resolved_by"  integer     REFERENCES "users"("id") ON DELETE SET NULL,
  "evidence"     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "costantino_findings_target_idx"
  ON "costantino_findings" ("target_kind", "target_id");

CREATE INDEX IF NOT EXISTS "costantino_findings_detected_at_idx"
  ON "costantino_findings" ("detected_at" DESC);

CREATE INDEX IF NOT EXISTS "costantino_findings_open_idx"
  ON "costantino_findings" ("resolved_at")
  WHERE "resolved_at" IS NULL;

-- Costantino LLM slot — points at the same model the Pietro orchestrator uses.
-- Defensive: skip insert if pietro-orchestration slot is missing (e.g. fresh DB
-- before admin-resources-005 ran). Re-running this migration is a no-op once
-- the slot exists.
INSERT INTO "admin_resources" ("kind", "slug", "display_name", "description", "config")
SELECT
  'llm_slot',
  'costantino-orchestration',
  'Costantino — Orchestration',
  'LLM slot for the Costantino Data Custodian agentic loop. Inherits the model from pietro-orchestration on initial seed; admin can override at runtime.',
  jsonb_build_object('modelSlug', "config"->>'modelSlug')
FROM "admin_resources"
WHERE "kind" = 'llm_slot'
  AND "slug" = 'pietro-orchestration'
  AND ("config" ? 'modelSlug')
ON CONFLICT ("kind", "slug") DO NOTHING;

-- Admin-editable cadence parameter (R4). value_ms is what the scheduler reads
-- at the start of every cycle; min_ms/max_ms are the clamp bounds the
-- scheduler enforces on read.
INSERT INTO "admin_resources" ("kind", "slug", "display_name", "description", "config")
VALUES (
  'parameter',
  'costantino-health-cycle-interval-ms',
  'Costantino Health Cycle Interval (ms)',
  'How often Costantino runs an integration-health audit. Admin-editable at runtime; the scheduler re-reads this row at the start of every cycle and clamps to [min_ms, max_ms]. Initial value: 5 days.',
  '{"value_ms": 432000000, "min_ms": 60000, "max_ms": 2592000000, "unit": "ms", "human": "5 days"}'::jsonb
)
ON CONFLICT ("kind", "slug") DO NOTHING;
