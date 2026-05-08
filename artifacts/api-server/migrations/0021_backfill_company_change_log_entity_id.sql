-- Task #332 — Backfill company-typed assumption_change_log rows that
-- were written with entity_id = 0 to use the singleton management
-- company's real `global_assumptions.id`.
--
-- Why: TabActions.tsx in client/src/components/company-assumptions used
-- to hardcode entityId: 0 on the change-log POST when a user clicked
-- "Keep my value" on a Gustavo warning. That broke audit-trail queries
-- in `getAssumptionHistory("company", <real id>)` because the override
-- rows lived under the phantom id 0. The TS code now sends `global.id`;
-- this migration repoints existing history so the audit trail is
-- contiguous.
--
-- Idempotent: a re-run finds no rows to update because they've already
-- been moved off entity_id = 0.
--
-- Safe-no-op: if the global_assumptions table is empty (fresh DB), the
-- subquery returns NULL and the UPDATE matches zero rows.

UPDATE assumption_change_log
   SET entity_id = (SELECT id FROM global_assumptions ORDER BY id ASC LIMIT 1)
 WHERE entity_type = 'company'
   AND entity_id = 0
   AND EXISTS (SELECT 1 FROM global_assumptions);
