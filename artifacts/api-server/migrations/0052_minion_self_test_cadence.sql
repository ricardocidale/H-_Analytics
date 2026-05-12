-- 0052_minion_self_test_cadence
--
-- Task #1397 — Seed the admin-editable cadence parameter row for the
-- minion-self-test scheduler. The scheduler reads value_ms at the start
-- of every cycle and clamps to [min_ms, max_ms]; if this row is absent
-- the scheduler safely falls back to a 6 h compile-time default, but
-- seeding here guarantees the row exists out of the box so admins can
-- tune the cadence without first having to create it manually.

INSERT INTO "admin_resources" ("kind", "slug", "display_name", "description", "config")
VALUES (
  'parameter',
  'minion-self-test-cycle-interval-ms',
  'Minion Self-Test Cycle Interval (ms)',
  'How often the minion-self-test scheduler runs every entry in MINION_SELF_TESTS (Aldo, Carlo, Dino, Enzo) and opens / resolves costantino_findings rows for any deterministic-helper regression. Admin-editable at runtime; the scheduler re-reads this row at the start of every cycle and clamps to [min_ms, max_ms]. Initial value: 6 hours.',
  '{"value_ms": 21600000, "min_ms": 60000, "max_ms": 604800000, "unit": "ms", "human": "6 hours"}'::jsonb
)
ON CONFLICT ("kind", "slug") DO NOTHING;
