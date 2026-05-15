---
title: "Drizzle two-phase column drop runbook"
date: 2026-05-13
category: conventions
module: lib/db/migrations
problem_type: convention
component: database
severity: medium
applies_when:
  - "Removing a column from a Drizzle schema file under `lib/db/src/schema/`"
  - "Renaming a column where the rename is non-trivial (Drizzle treats it as drop+add)"
  - "Replacing one column with several (e.g., a generic `propertyId` split into `slide2PropertyId`, `slide3PropertyId`, etc.)"
tags:
  - drizzle
  - neon-postgres
  - migration
  - two-phase
  - column-drop
  - deployment-safety
---

# Drizzle two-phase column drop runbook

## The rule

Never drop a column from `lib/db/src/schema/` **in the same PR that stops reading it**. Split the work across two PRs:

| Phase | What the PR does | What it does NOT do |
|---|---|---|
| **PR 1 (deprecate)** | Stops reading and writing the column everywhere in code. Marks the schema column with `// TODO: drop in PR #<n+1>` so the deprecation is visible. The column **stays** in the schema file. | Does not change the database schema. Does not generate a Drizzle migration. |
| **PR 2 (drop)** | Removes the column from the schema file. Runs `pnpm --filter @workspace/db run generate` to produce the `DROP COLUMN` migration. Mirrors the migration into `artifacts/api-server/migrations/` per the three-folder runbook. | Does not modify any code that was already migrated off the column in PR 1. |

PR 2 must land **after PR 1 is deployed to production** — the deploy of PR 1 is the gate, not the merge of PR 1. The reason is in [§Why two phases](#why-two-phases) below.

## Why two phases

Three failure modes the two-phase rule prevents. Each came up at least once in this codebase before the rule was written down.

### 1. Old pods read the dropped column during the rolling deploy

Railway and most managed platforms do a **rolling deploy**: new pods come up while old pods still serve traffic. If PR 1 drops the column from the DB and from the read path in the same release:

- The `DROP COLUMN` runs on container startup (via the runtime-guard pattern in `artifacts/api-server/src/migrations/*.ts`) or via the Drizzle migrator at the deploy boundary.
- The old pod, still serving the previous build, still has SELECT statements that reference the column.
- The old pod fails every request that hits that code path until the rolling deploy completes.

Two-phase prevents this: PR 1 (deployed first) takes the read path off the column without touching the DB. PR 2 (deployed after PR 1 is fully rolled out) drops the column when nothing reads it anymore.

### 2. The runtime-guard re-adds the column on every dev DB boot

The api-server's runtime guards (`artifacts/api-server/src/startup/migrations.ts` → individual guards under `artifacts/api-server/src/migrations/*.ts`) run idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` at boot to heal dev DBs. If a column is dropped in the *Drizzle* migration file but the runtime guard for that table still includes it in its `ADD COLUMN` block, every dev DB boot **re-adds the column you just dropped**.

PR 2 must update both:

- The schema file (`lib/db/src/schema/<table>.ts`)
- The runtime guard for that table (`artifacts/api-server/src/migrations/<table>-*.ts`)

…in the same PR. If PR 2 forgets the guard update, the column comes back on the next dev boot and the next Drizzle generate diff will look broken. See [`drizzle-migration-state-drift-missing-tables-2026-05-07.md`](../database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md) for the broader Drizzle state-drift class this sits inside.

### 3. Rollback safety

If PR 1 ships and a regression surfaces in production, rolling back is cheap — the column is still there, you just revert the application code. If PR 1 had also dropped the column, rollback requires restoring the column data (which is gone) or shipping a forward-fix that recreates the column with sentinel values. Two-phase keeps rollback boring.

## Concrete worked example: `slide1PropertyId`

The Factory v2 plan ([`docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md`](../../plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md), U3) changed the slide-property mapping: slide 1 became a multi-property overview, so `slide1PropertyId` was no longer meaningful. The plan called for two-phase drop:

**PR 1 — the U3 PR (`feat/factory-v2-foundation` → merged as #115):**

1. In `lib/db/src/schema/slide-factory-runs.ts`, kept the column definition unchanged. Added:

   ```ts
   // TODO: drop in PR #<n+1> — Factory v2 made slide 1 a multi-property
   // overview, so per-run slide1PropertyId is no longer meaningful. Stop
   // reading/writing in this PR; the next PR drops the column itself
   // and clears the runtime guard.
   slide1PropertyId: integer("slide1_property_id").references(...)
   ```

2. Removed all reads/writes of `slide1PropertyId` in `artifacts/api-server/src/routes/slide-factory.ts`, `artifacts/api-server/src/chat/rebecca-tool-impls-slide-factory.ts`, and any downstream consumer.

3. Did not modify the runtime guard or generate a migration. The column persists at the DB level; PR 1 just stops touching it.

4. Typecheck verifies no leftover readers. The deploy of PR 1 confirms the column is unused in production.

**PR 2 — the follow-up (deferred to follow-up per plan §Phased Delivery):**

1. Remove the column from `lib/db/src/schema/slide-factory-runs.ts`.
2. Run `pnpm --filter @workspace/db run generate` to produce the `DROP COLUMN slide1_property_id` migration in `lib/db/migrations/`. Mirror it into `artifacts/api-server/migrations/` per the three-folder runbook (see [`docs/runbooks/schema-migrations.md`](../../runbooks/schema-migrations.md)).
3. Update the matching runtime guard under `artifacts/api-server/src/migrations/slide-factory-runs-*.ts` so it stops trying to `ADD COLUMN IF NOT EXISTS slide1_property_id` on boot. Without this step, the column reappears on every dev DB restart.
4. Run `pnpm --filter @workspace/scripts run check:migration-guards` — the gate must PASS.
5. Verify on dev: drop the column manually, restart the api-server, confirm the column does NOT come back.

## Special cases

### Renames are not really renames

Drizzle does not have a first-class column rename in the generator — `name: integer("foo_id")` → `name: integer("bar_id")` produces a `DROP COLUMN foo_id` + `ADD COLUMN bar_id` migration. Treat any column rename as a two-phase rename: PR 1 adds the new column and starts dual-writing both columns, PR 2 stops writing the old column and drops it. Reading prefers the new column with a fallback to the old during the transition.

### Splitting a column into several

When a column is being split (e.g., `propertyId` → `slide2PropertyId` + `slide3PropertyId` + `slide5PropertyId` in Factory v2 U3), the same rule applies, multiplied:

- PR 1 adds the new columns, starts writing them, stops reading the old column. Marks the old column with `// TODO: drop in PR #<n+1>`.
- PR 2 drops the old column.

The Factory v2 U3 PR (#115) is the precedent — it added `slide4PropertyId` and `wishListLog` and the new `status` enum values while leaving `slide1PropertyId` in place per this rule.

### Idempotency on the new columns

Phase 1's `ADD COLUMN` for the *new* columns must be wrapped in `IF NOT EXISTS` in the runtime guard so a partial dev DB heals on boot. The migration file (Drizzle-generated) does not need this — migrations are tracked by `__drizzle_migrations` and only run once. The runtime guard is the belt-and-suspenders layer for dev DBs that may have drifted (see the migration-state-drift learning above).

## Pre-flight checklist (PR 1 — the deprecation PR)

- [ ] Schema column has `// TODO: drop in PR #<n+1>` comment naming the rationale.
- [ ] Grep the codebase for the column name (TypeScript field AND SQL column name) — no read or write call sites remain.
- [ ] `pnpm run typecheck` — clean. If a stale reader survives, this catches it.
- [ ] No Drizzle migration generated for this PR. `pnpm --filter @workspace/db run generate` should produce an empty diff for the deprecated column.
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS (unchanged).

## Pre-flight checklist (PR 2 — the drop PR)

- [ ] PR 1 has been deployed to production (not just merged). Wait for the deploy-success signal.
- [ ] Column removed from `lib/db/src/schema/<table>.ts`.
- [ ] `pnpm --filter @workspace/db run generate` produces a clean `DROP COLUMN` migration.
  **Non-interactive environments (Replit, CI):** if `generate` hangs waiting for TUI input, write
  the migration SQL manually instead — see
  [`docs/solutions/workflow-issues/drizzle-kit-generate-tui-hang-non-interactive-2026-05-15.md`](../workflow-issues/drizzle-kit-generate-tui-hang-non-interactive-2026-05-15.md).
- [ ] Migration mirrored into `artifacts/api-server/migrations/` with a non-colliding slot number per [`docs/runbooks/schema-migrations.md`](../../runbooks/schema-migrations.md).
- [ ] Runtime guard for the table updated to stop adding the column on boot.
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS.
- [ ] Tested on a dev DB: drop the column manually, restart, confirm it stays dropped.

## Related

- [`docs/runbooks/schema-migrations.md`](../../runbooks/schema-migrations.md) — the canonical three-folder migration runbook this convention sits inside.
- [`docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md`](../database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md) — the state-drift class that motivates the runtime-guard layer.
- [`docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md`](../../plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md) U3 — the originating use case (slide1PropertyId deprecation).
- [`docs/solutions/workflow-issues/drizzle-kit-generate-tui-hang-non-interactive-2026-05-15.md`](../workflow-issues/drizzle-kit-generate-tui-hang-non-interactive-2026-05-15.md)
  — when `generate` hangs on interactive TUI in Replit/CI: write the migration SQL manually.
