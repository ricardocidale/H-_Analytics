# Cleanup: `schema-drift.test.ts` CI-vs-prod baseline mismatch

> **Owner:** CC (server-side test + script). CC's lane per 2026-04-27 `claude-replit-split.md` revision.
> **Discovered:** 2026-04-27 during v1 CI investigation. Pre-existing — pre-dates G1 saga.
> **Severity:** Low — test reports false positive in CI; doesn't gate any actual data integrity.

## What's failing

`tests/proof/schema-drift.test.ts > Schema Drift — Drizzle vs live Postgres > baseline contains no stale entries (each listed key is still drifting)` fails in CI with:

```
The following BASELINE_DRIFT entries no longer match any live drift finding —
remove them from script/schema-drift-check.ts:
  [type-mismatch] assumption_change_log.created_at
  [type-mismatch] properties.last_validated_at
  [nullability-mismatch] users.password_hash
```

**Locally the test passes** (3/3) because the local Postgres has the listed drift entries.

## Root cause

`script/schema-drift-check.ts` carries a `BASELINE_DRIFT` list of known drift items between Drizzle's schema declaration and the **production/local-development Postgres**. Each entry documents a known mismatch that's pre-existing and requires a migration to fix:

- `assumption_change_log.created_at` — DB has `timestamptz`; Drizzle declares plain `timestamp`. Pre-existing as of Task #490.
- `properties.last_validated_at` — same `timestamptz` vs `timestamp`.
- `users.password_hash` — DB enforces `NOT NULL`; Drizzle types it nullable for OAuth-only users.

The test asserts BASELINE_DRIFT entries STILL match live drift findings — i.e., it catches the case where someone fixed the drift but forgot to remove the baseline entry.

**The CI mismatch:** CI's Postgres is a fresh `pgvector/pgvector:pg16` container created by `pnpm run db:push --force` (drizzle-kit). That database has zero drift because it's generated FROM the Drizzle schema. So all 3 baseline entries appear "stale" relative to CI's DB, and the test fails.

## Why it's not just "delete the baseline"

The 3 entries are real drift in production. Deleting them silently passes the test in CI but loses the documentation trail of known prod drift. Future developers wouldn't see the comments explaining why these mismatches exist + what migration would fix them.

## Three viable fixes

| Option | Approach | Effort |
|---|---|---|
| **A** | Skip the test in CI (`if (process.env.CI) it.skip(...)`) | 5 min — fastest |
| **B** | Detect CI mode by inspecting the connection string or running schema-drift only when the DB has the documented drift | 30 min — preserves test value locally, no false positives in CI |
| **C** | Migrate prod to fix the 3 drift entries; remove BASELINE_DRIFT entirely; both CI + local will agree | 1-2h + a migration that touches `assumption_change_log`, `properties`, `users` — risk of touching live data |

**Recommendation: B.** The test's value is catching local drift regressions; in CI it adds no signal. The simplest CI-aware skip checks for the documented drift entries in `pg_catalog` and skips the baseline check when none exist.

## Tasks (S1-S3)

### S1 — Add CI-mode detection to `schema-drift.test.ts`

**File:** `tests/proof/schema-drift.test.ts`

**Change:** Wrap the `baseline contains no stale entries` test in a CI-detection guard. Pseudocode:

```ts
import { sql } from "drizzle-orm";

it("baseline contains no stale entries (each listed key is still drifting)", async () => {
  // CI-aware: when running against a fresh drizzle-generated DB, the
  // BASELINE_DRIFT entries cannot be checked because they document drift
  // that ONLY exists in databases predating the migration listed in their
  // `reason` field. Skip with a recorded message rather than fail.
  const driftFound = await runActualDriftCheck(); // returns { hasDocumentedDrift: bool }
  if (!driftFound.hasDocumentedDrift) {
    console.log("[schema-drift] BASELINE check skipped — fresh CI DB has no documented drift");
    return;
  }
  // ... existing baseline-staleness assertion
});
```

**Acceptance:**
- [ ] Test PASSES in CI (where DB has no documented drift) AND in local prod-shaped DB.
- [ ] On a fresh DB, console emits the skip message.
- [ ] On a drift-carrying DB, behaves exactly as today.

### S2 — Verify the skip path doesn't mask real regressions

**File:** Same.

**Change:** Add a sibling test that asserts BASELINE_DRIFT entries are well-formed (each has key, kind, reason) regardless of DB state. This preserves the documentation guard even when the live-drift check is skipped.

**Acceptance:**
- [ ] New test PASSES in CI and local.
- [ ] If someone removes a `reason` field from BASELINE_DRIFT, the new test fails.

### S3 — Document the CI-vs-local divergence

**File:** `script/schema-drift-check.ts` (top-of-file comment) + this packet's completion report.

**Change:** Comment block explaining that BASELINE_DRIFT is a local-DB-only contract; CI runs against a fresh Drizzle-generated DB and the skip is intentional.

**Acceptance:**
- [ ] Comment present.
- [ ] Future-readers see why the test skips in CI.

## Verification

- `npm run test:file -- tests/proof/schema-drift.test.ts` — PASSES locally + in CI
- `npm run verify:summary` — UNQUALIFIED (no regression in proof suite)
- Manual: push to a PR branch, watch CI go green on the test-and-verify Run Tests step (scoped to this test)

## Out of scope

- Fixing the 3 drift entries via migrations (Option C). That's its own packet — touches live data.
- Other proof tests with similar CI-vs-local divergence (search for `BASELINE_*` lists in `tests/proof/` if any others exist).

## Estimated effort

30-45 minutes. Single file edit + a small sibling test. Single commit.
