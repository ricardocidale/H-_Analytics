# Homework for Replit — run after the Analyst soft-gate slice is done

**Audience:** Replit Agent
**Status:** Queued. Start when T008/T009 is complete and all five gates are green.
**Date filed:** 2026-04-20
**Author:** Claude Code

---

## Snapshot of where things stand

- **All 5 gates green at time of writing** — TS 0, Lint 0 errors / 41 warnings, Vocab 11/11, test:summary PASS, verify:summary UNQUALIFIED (20 phases).
- **Your last hour of work audits clean** — commits `a3066ca3`, `d560788f`, `eee34d93`. Zero `any` in production code. Tests shipped with features. No gate regressions. Keep shipping.
- **Claude Code closed its own queue** earlier this session:
  - BLOCKED-analyst-interactive-slice.md — deleted (both regressions fixed in `bc4ca5d1`)
  - seed-schema-sync-coverage.md — deleted (36 columns wired into SEED_PROPERTY_DEFAULTS in `6288a64d`)
  - So those two files are GONE on purpose, not missing.

---

## Homework queue — work in this order

### 1. Push your local commits to origin

At time of filing, `a3066ca3`, `d560788f`, `eee34d93` are on the local `main` branch but NOT on `origin/main`. `git push origin main` when you're ready to share.

### 2. Finish the Analyst soft-gate slice (T008/T009+)

Whatever's left in your current chunk. You know the plan; don't interrupt yourself with the rest of this queue until the slice is shipped and all 5 gates pass.

### 3. ADR-004 Phase 5A — verdict cache DB migrations

File: `.claude/replit-handoffs/phase-5a-verdict-cache-migrations.md`

Add three nullable columns + one index:
- `research_runs.cache_key` (text, indexed)
- `research_runs.cache_inputs_hash` (text)
- `assumption_guidance.superseded_at` (timestamp)

Spec + acceptance criteria + rollback are in the handoff. Zero new tables. Claude-side cache-keys utility is already in `engine/analyst/cognitive/cache-keys.ts` with 21 tests passing; it's waiting for these columns to exist before Phase 5B engine-client.ts read path lands (Claude's next step, blocked on your migration).

### 4. ADR-005 Phase 1 — workspace bootstrap (pnpm + turborepo)

File: `.claude/replit-handoffs/phase-1-workspace-bootstrap.md`

Tooling-only, zero file moves. Risk: low if the 7-step verification (including Replit deploy dry-run) passes. This kicks off the broader workspace reorganization. If Phase 1 + Phase 2 (`packages/shared` extraction) land cleanly, ADR-005 transitions Proposed → Accepted per its own acceptance criteria.

**Do NOT start this until (3) is done.** They touch different things but the workspace move is substantial and you don't want the cache-cache migration stuck in the middle of a pnpm restructure.

### 5. NaN-coercion fix in extractor

File: `.claude/replit-handoffs/nan-coercion-extractguidance-fix.md`

**Time-blocked until 2026-04-22 18:14 UTC.** The handoff explicitly forbids shipping during the OT-A.4 T+72h observation window — a logic change to `server/ai/guidance/extractor.ts` during observation would be indistinguishable from OT-A.4 regression signal. Wait until window closes, then ship.

Pure logic fix (`Number.isFinite` guard). Either agent can do it; Claude will take it if you're still on the analyst slice when the window opens.

### 6. OT-A.5 v6 rerun

**Time-blocked until 2026-04-22 18:14 UTC.** Same window. $22 API spend on the existing BYOK key.

Your v6 prompt diff package should already be staged at `.local/drafts/`. When the window closes, authorize the rerun and validate the three tracks (inflationRate Class 2 verification, 6 T2 USALI anchors, 4 non-T1 mode-collapse fields).

### 7. Sentry financial contexts handoff

File: `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md`

Adds structured error classes (`FinancialSentryError`, `BalanceSheetImbalanceError`, etc.) + breadcrumbs + 100% sampling for financial-critical errors. `SENTRY_DSN` is already in Replit Secrets.

Heavier lift (~400 LOC). Good candidate for a dedicated session, not wedged between other work.

### 8. PostHog wiring handoff

File: `docs/operational-tooling/HANDOFF-replit-posthog-wiring.md`

Initialize posthog-js (already in package.json, just not wired). Client-side event tracking for Analyst consults, verdict acceptance, conviction-floor downgrades, etc. `VITE_POSTHOG_KEY` is already in Replit Secrets.

Lighter lift (~200 LOC). Can pair with (7) in the same session since both are observability.

---

## What Claude's sitting on (informational — NOT your homework)

- **Phase 5B engine-client.ts read path** — blocked on your (3). Claude will pick up immediately after your migration lands.
- **Scoreboard hooks** — three git hooks shipped (`.husky/commit-msg`, `.husky/cosmetic-warn`, `.husky/stage-collision-check`). All active. The commit-msg hook is blocking; the other two are advisory warnings.
- **V2 detector upgrades** — deferred. Only build if you hit a gap the current detectors missed.

---

## What's currently green / not-broken

For reference so you don't re-investigate:

- **Financial engine** — 13/13 mandatory tests PASS, 20-phase verify UNQUALIFIED
- **4 cross-check detectors** — orphans/any-prop/literal-drift/seed-schema-sync all green with baselines at 0, 0, 0, 0
- **`analyst-scoped-runner.ts`** — your T004 code; Claude fixed the TS error in `bc4ca5d1` (was reading `researchConfig.company.llmVendor` which doesn't exist; now reads `researchConfig.companyLlm.primaryLlm` via ContextLlmConfig).
- **`AnalystActionButton.tsx`** — tooltip text was "Ask the Analyst..." (vocab violation); Claude changed to "Have the Analyst..." in `bc4ca5d1`.

---

## Commit hygiene reminders

- **Push `main` before starting each queue item.** Keeps origin synced with local.
- **Per-file `git add` preferred** over `git add -A`. The stage-collision-check hook warns when another author has in-flight state.
- **Cosmetic-swap budget:** 1 opengraph/social image swap per month maximum. See `.claude/rules/cosmetic-budget.md`. The pattern showed up even in this hour's work.
- **Commit subjects ≥ 15 chars, not in the blocklist.** Hook will reject otherwise. This is a hard gate.

---

## When you finish the queue

Delete this file. Or leave it as a historical record — either's fine.

Ping back with "homework queue complete, ready for next" and Claude will package the next wave.
