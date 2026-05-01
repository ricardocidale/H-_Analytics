# Handoff: ADR-004 Phase 5A — Verdict Cache Migrations

**Audience:** Replit Agent
**Status:** Ready to execute (ADR-004 accepted 2026-04-20)
**Owner:** Replit (DB migrations + drizzle schema only; Claude shipped the pure-code utilities)
**Target:** 1 commit, ~30 LOC of schema + 1 migration file
**Prereq:** None — ADR-004 is Accepted; Claude-side code (`engine/analyst/cognitive/cache-keys.ts`) already in main

---

## What to do

Add three columns across two existing tables. No new tables.

### 1. `research_runs` — add two columns

File: `shared/schema/intelligence-v2.ts` (or wherever `researchRuns` is declared — grep for `pgTable("research_runs"`).

```ts
cacheKey: text("cache_key"),
cacheInputsHash: text("cache_inputs_hash"),
```

Both nullable for back-compat with existing rows. New rows must populate both (enforced later in Phase 5C write-after).

Add an index on `cache_key` for the hot-path lookup:

```ts
.index("research_runs_cache_key_idx").on(table.cacheKey)
```

(Inside the `pgTable` second-arg or whatever convention `intelligence-v2.ts` uses.)

### 2. `assumption_guidance` — add one column

Same file, on `assumptionGuidance`:

```ts
supersededAt: timestamp("superseded_at"),
```

Nullable — existing rows have `null` (not superseded). New values set when a later run replaces the field.

### 3. Drizzle migration

Run `drizzle-kit generate` to produce the SQL migration. Expected shape:

```sql
ALTER TABLE research_runs ADD COLUMN cache_key text;
ALTER TABLE research_runs ADD COLUMN cache_inputs_hash text;
CREATE INDEX research_runs_cache_key_idx ON research_runs (cache_key);
ALTER TABLE assumption_guidance ADD COLUMN superseded_at timestamp;
```

Verify on dev Neon first: `npm run db:push` (or whatever the dev migration command is). Confirm via `psql` that columns exist and index was created.

### 4. Production migration runbook

Write the deployment steps into the handoff's BLOCKED.md sibling if anything unusual comes up, otherwise follow the standard Neon migration flow in `.claude/skills/database/SKILL.md`.

---

## What NOT to do in this handoff

These are Claude's next piece, NOT yours:

- ❌ Do NOT implement `engine-client.ts` read path — that's Phase 5B (Claude, next)
- ❌ Do NOT write the orchestrator completion hook — that's Phase 5C
- ❌ Do NOT wire invalidation hooks on property save — also Phase 5C

Phase 5A is purely: columns + index + Drizzle migration.

---

## Verification

1. `npx tsc --noEmit` — zero errors. The new columns must compile cleanly.
2. `npm run lint` — zero errors (warnings OK; current count ~40).
3. `npm run test:file -- tests/analyst/cache-keys.test.ts` — 18/18 PASS (this tests the Claude-side utility code that will use your columns; unaffected by your migration).
4. `npm run test:summary` — all tests PASS.
5. `npm run verify:summary` — Opinion UNQUALIFIED across all 19 phases including `Seed/Schema Sync`. **Note**: the new columns might add baseline entries to `seed-schema-sync`; if so, add them to `SYSTEM_COLUMN_EXEMPTIONS` in that test since `cache_key`, `cache_inputs_hash`, `superseded_at` are system-managed (not user-settable defaults).
6. `psql $DATABASE_URL -c "\d research_runs"` — verify columns + index exist.
7. `psql $DATABASE_URL -c "\d assumption_guidance"` — verify `superseded_at` exists.

---

## Commit convention

```
db: ADR-004 Phase 5A — verdict cache columns + index

Add research_runs.cache_key (text, indexed), research_runs.cache_inputs_hash,
assumption_guidance.superseded_at. All nullable for backcompat; new rows
populated by Phase 5C write-after hook (not yet shipped).

Verified: TS 0, Lint 0 errors, test:summary PASS, verify:summary UNQUALIFIED.
psql-verified columns + index exist on dev Neon.

Ref: docs/architecture/decisions/ADR-004-verdict-cache.md
Claude's Phase 5A code: engine/analyst/cognitive/cache-keys.ts (already in main)

Surfaces: S13 (shared schema), S10 (migrations)

Replit-Commit-Author: Agent
```

---

## After Phase 5A lands

Post a note in `.claude/session-memory.md` saying "ADR-004 Phase 5A shipped as `<sha>`; Claude Code to pick up Phase 5B (engine-client.ts read path) next."

Then Claude will:
1. Implement `engine/analyst/cognitive/engine-client.ts` with the cache lookup
2. Wire `MissReason` telemetry
3. Add integration tests covering hit / miss / ttl / superseded paths

---

## References

- ADR-004 — `docs/architecture/decisions/ADR-004-verdict-cache.md`
- Phase 5B scope — ADR-004 §"Implementation notes — Phase 5B"
- Cache-key utilities — `engine/analyst/cognitive/cache-keys.ts` (already in main)
- Cache-key tests — `tests/analyst/cache-keys.test.ts` (18 tests, green)
- Drizzle patterns — `.claude/skills/database/SKILL.md`
