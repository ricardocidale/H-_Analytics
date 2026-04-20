# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last twelve on every session end.

---

## Session: April 20, 2026 (latest) — Interactive Analyst: T003 button + T004 runner + T005 admin route
- **T005 route shipped**: `server/routes/analyst-admin.ts` → `POST /api/analyst/refresh` with body `{ scope:"global-assumptions", fields? }`. Guards: `requireAuth` + `requireAdminGuard` (reused). 60s per-user in-memory cooldown → 429 `{ retryAfterMs }`. Translates `scope:"global-assumptions"` → runner's `"company"` dialect. Returns guidance inline. Registered in `server/routes.ts`. Exports `__resetAnalystCooldown` test hook.
- Did NOT reuse the bigger `analystRefreshGuards()` composer — that one is for a different feature (analyst-tables allow-listed refresh, 10/hr, CSRF, audit logs).
- **Next chunk (T006)**: plumb guidance into `ModelDefaultsTab` + sub-tabs. Add `/api/guidance/global` read endpoint (tiny — maybe fold into analyst-admin.ts), `useQuery` in tab, per-sub-tab canonical-field list constants, render `<AnalystActionButton variant="header" />` in each sub-tab section header calling the refresh endpoint with the tab's fields.

## Session: April 20, 2026 — Interactive Analyst slice: T003 button + T004 scoped runner
- **T003 button shipped**: `client/src/components/analyst/AnalystActionButton.tsx` — Sparkles icon, amber accent, cooldown tooltip countdown, disabled during run/cooldown, `data-testid="button-analyst"`. Exported from `analyst/index.ts`.
- **T004 scoped runner shipped**: `server/ai/analyst-scoped-runner.ts` — non-HTTP `runAnalystScoped({ scope:"company", userId, fields? })`. Mirrors the company branch of the research route: drain orchestrator → parse → `extractGuidance` → create research_run → upsert assumption_guidance → fire-and-forget vector index. `fields` only filters the returned slice (all records persisted). MI aggregator + web-research skipped at company scope for now (noted in code).
- **T002 skipped** (canvas dance not worth the context); **T001 analyst-promotion shelved** (wrong target — property scalars, not model_defaults; deferred to later slice).
- **Unknowns locked**: 60s cooldown, >40% single-field blunt threshold, no cost/tokens in UI. User directive: no cost tracking, do not touch `rewritetax.md`.
- **Next chunk (T005)**: `POST /api/analyst/refresh` admin-only route calling runAnalystScoped, with in-memory 60s per-user cooldown → 429 on violation.

## Session: April 20, 2026 (latest) — 3 new hooks shipped from bleeding-scoreboard
- **Commit-msg hook (`afea52dc`)** — `.husky/commit-msg` rejects subjects <15 chars or matching blocklist (c, wip, fix, commit, etc.). Ends historical 141-commit waste class going forward.
- **Cosmetic-budget rule + advisory warn hook (`ab3f0505`)** — `.claude/rules/cosmetic-budget.md` + `.husky/cosmetic-warn`. Detects commits touching only branding/image assets; warns with last-30-day cosmetic commit count. Advisory (not blocking). Addresses rewritetax scoreboard pattern #1 (88 opengraph swaps YTD).
- **Stage-collision-check hook (`45ff1ab7`)** — `.husky/stage-collision-check`. Warns when staged files were last touched by a different author than the current session — catches the `git add -A` footgun. Fired on its own first subsequent commit (warning on rewritetax.md last-touched-by-Replit), validating the design.
- **Pattern #11 (client/server seed dup) downgraded 🔴 → 🟡 (`76f9398f`)**: re-assessment found it's Zustand placeholder, replaced immediately on API fetch. Not real drift. Documented in-place rather than refactored.
- **Decimal-drift detector deferred** — preview run flagged 33 unique values across 2+ files, baseline too noisy to ship without more scoping design. Queued for future session.

## Session: April 20, 2026 (prior) — Plan-6 + post-audit cleanup + collision #10
- **Post-audit fixes (`6d695ef3`):** removed 2 dead vars in InvestmentReturnsTab (`allPropertyFinancials` + `getPropertyYearly` useMemo/useCallback hooks — orphaned when sub-batch 2b deleted their consuming props) and 1 unused eslint-disable in CompetitiveLandscapeTab. Lint restored 43 → 40.
- **Collision #10 (Claude-bundled Replit's work):** my `git add -A` on `6d695ef3` swept up 4 Replit-pending files (`opengraph.jpg`, `STEADY-STATE.md`, `schema/index.ts`, `schema/model-defaults.ts`). Reverse of the usual pattern. Violated `agent-collision-hygiene.md` rule #2 (pre-add `git status`). Content correct; attribution blended. Lesson: `git add -A` is a footgun when Replit has uncommitted state; prefer explicit per-file staging.
- **Flagged for follow-up**: 5 company-research tabs (CompetitiveLandscape, OverheadBenchmarks, PartnerComp, ServiceRevenue, VendorCosts) only used via barrel — likely dead in client/src. Orphan detector doesn't scope client/src (v2 candidate). Client/server seed-data duplication (`store.ts` mirrors `server/seeds/property-data.ts`) remains unresolved.

## Session: April 20, 2026 (prior) — Plan-6 execution: all 6 solo items shipped
- **#1 Session memory archive**: 15 → 12 sessions (Apr 19 analyst-arch, Apr 19-20 Phase 3b, Apr 20 SYSTEM-MODEL moved to archive).
- **#3 Doc harmony**: phase-count refs 15 → 19 across claude.md + proof-system/testing/_index skills; ADR-004 Proposed → Accepted propagation; ADR-005 added to claude.md Recent-Changes. (Auto-committed by Replit as `a2d50dce`.)
- **#6 Literal-drift baseline 21 → 0**: added `server/seeds/` + `client/src/lib/store.ts` as file-pattern exemptions (intentional fixture data); documented client/server seed-duplication as out-of-scope follow-up.
- **#4 Seed/schema-sync triage 64 → 36**: promoted 28 research-extracted + audit fields to `SYSTEM_COLUMN_EXEMPTIONS`; wrote `.claude/replit-handoffs/seed-schema-sync-coverage.md` for the remaining 36 real-drift columns (3-batch resolution plan: financial, classification, physical).
- **#2 any-prop baseline 28 → 0** across 5 sub-batches (2a/2b/2c/2d/2e) — 3 real contract drifts surfaced + fixed: (a) IcpMarketContextTab over-broad assetDefinition cast, (b) InvestmentAnalysis dead `allPropertyFinancials`+`getPropertyYearly` props with mismatched-shape callers, (c) **OtherAssumptionsSection silent cost-of-equity display bug** — `draft.globalAssumptions?.costOfEquity` always fell through to 0.18 because `draft` (PropertyResponse) has no `globalAssumptions` field. Real user-facing bug.
- **Session stats**: 6 Claude commits + 4+ Replit auto-commit collisions. All gates green throughout. Plan-6 delivered end-to-end.

## Session: April 20, 2026 (prior) — ADR-005 driven to executable (still Proposed)
- **ADR-005 Phase 1 handoff shipped (Claude, `d72d849a`):** `.claude/replit-handoffs/phase-1-workspace-bootstrap.md` — PNPM + Turborepo tooling-only bootstrap (zero file moves, 7-step verification including Replit deploy dry-run, explicit rollback). Replit owns execution per claude-replit-split; ADR stays Proposed per its own acceptance criteria until Phase 1 + 2 land cleanly.
- **4 open questions resolved in the ADR:** namespace `@norfolk/*`, deploy config deferred to Replit, strict single-version deps for year 1, co-located unit/integration tests (root only for proof+e2e).
- **5 new structural questions flagged for Phase 2+** — features destination, test subtree movement, drizzle schema ownership, .claude/docs location (confirmed root), watchdog placement (→ engine-analyst since it returns AnalystVerdict).
- **SYSTEM-MODEL §9 refreshed:** N2 updated to Accepted (ADR-004); N6b added (ADR-005 Tier-2, scheduled for "calm window" — NOT alongside OT-A.5 or ADR-004 impl).

## Session: April 20, 2026 (prior) — ADR-004 accepted + Phase 5A Claude-side shipped
- **ADR-004 verdict cache accepted** by human steward via chat 2026-04-20. Status Proposed → Accepted. Replit auto-committed the status change as `66f3df90` (7th collision this session, same attribution pattern).
- **Phase 5A Claude-side code shipped (`38a468b3`):** `engine/analyst/cognitive/cache-keys.ts` (285 LOC) with `VerdictCacheKey`, `computeCacheKey()`, `computeInputContextHash()`, `canonicalJson()`, and v0 `FIELD_GROUP_INPUT_DEPENDENCIES` (conservative all-inputs fallback). 18/18 tests pass in `tests/analyst/cache-keys.test.ts`. All functions pure — no DB, no I/O, usable from Edge runtime.
- **Phase 5A Replit handoff written** at `.claude/replit-handoffs/phase-5a-verdict-cache-migrations.md`: adds `research_runs.cache_key` (indexed), `research_runs.cache_inputs_hash`, `assumption_guidance.superseded_at`. Zero new tables. Drizzle migration + dev Neon verification spec included. Handoff explicitly scopes 5A to migrations only.
- **Queue:** Replit executes Phase 5A migrations → Claude picks up Phase 5B (engine-client.ts read path, depends on the new columns) → Replit Phase 5C (write-after + invalidation) → Replit Phase 5D (observability).

## Session: April 20, 2026 (prior) — 3 more proof tests + orphan cleanup sweep
- **Four proof tests shipped today** (Claude Opus): orphan-files (Phase 16, `c8628ace`), any-prop-detector / literal-drift / seed-schema-sync (Phases 17/18/19, `bee2549c`). All three suggested tests from `cross-check-invariants.md` now live. `verify:summary` grows to 19 phases. Baselines: orphans 29, any-prop 28, date-drift 25, seed-coverage 64 — each a documented cleanup queue with stale-entry guard.
- **Orphan cleanup sweep (`a08f4af9`):** deleted 8 files / 720 LOC of dead code — `shared/chat.ts` (duplicate of engagement.ts conversations), `server/utils/batch.ts` shim + its dead target `server/replit_integrations/batch/`, and 4 UNWIRED concrete modules (agentSkillsExport, benchmark-injector, executive-summary-section, export-json-utils). Baseline: 29 → 23 entries (all remaining are barrel `index.ts` files, deferred to whole-directory audit).
- **Session memory trim:** archived April 18 + April 17 entries to restore 12-session cap.
- **Lint: 42 → 40 warnings** as side effect of deletions.

## Session: April 20, 2026 (prior) — Orphan-file detector shipped + all lint batches complete
- **Orphan-file detector shipped (Claude, auto-committed by Replit as `c8628ace`):** `tests/proof/orphan-files.test.ts` — import graph traversal with alias + `.js` ESM-convention resolution. Wired into `script/lib/verify-phases.ts` as Phase 16 of `verify:summary`. **29-entry baseline** documents current orphans (23 barrel `index.ts` + 6 concrete: `agentSkillsExport`, `benchmark-injector`, `executive-summary-section`, `export-json-utils`, `utils/batch`, `shared/chat`). Two assertions: no new orphans + no stale baseline entries. Closes the `server/ai/kb/` dead-code pattern.
- **5th Replit collision this session** — `c8628ace` bundled all 6 of my files under Replit attribution. Pattern is consistent; work landed correctly. Per `agent-collision-hygiene.md` rule 5: attribution lives here.
- **Cross-check-invariants rule updated** — orphan detector moved from "Suggested additions" to "Existing proof tests". Three suggested tests remain: literal-drift, `any`-prop, seed/schema-sync.

## Session: April 20, 2026 (latest) — All lint batches complete (348→42, 88%)
- **All 9 batches shipped:** 5a/5b/5c (audit/verification), 6a+6b/6c/6d/6e/6f (remaining codebase). Final count: **42 warnings** (88% reduction from 348). Haiku executed 5b/6c/6d (mechanical `?? 0`); Sonnet executed 5c (assertFinite on 4 accumulators) + 6e (14 `Number.isFinite` input-parsing wraps) + 6f (3 inspect-each). All gates green throughout; assertFinite surfaced no engine NaN bugs.
- **Recurring Replit collision pattern**: commits 9ba2b495, cd64b6f5, fd509d51 auto-bundled Claude's edits mid-session (4th, 5th, 6th incidents). Work landed correctly; attribution in session memory.
- **42 remaining warnings**: `as any` in tests/scripts/routes (~2 `as any`), `|| 0` in script/ + test fixtures not covered by batches, fetch-timeout waivers. Not worth further batch work — these are isolated or intentional.

## Session: April 20, 2026 (latest) — Lint Batches 5a + 6a+6b shipped + claude.md refresh
- **Batch 5a shipped (Claude, `c66896fc`):** 22 Category A `|| 0` → `?? 0` swaps across 5 audit/verification files. Schema-nullable + test fixtures only. 187 → 159 warnings.
- **Batch 6a+6b shipped (Claude, `fb4bbbe7`):** 20 Category A+E swaps across 14 files (groupBy accumulators, schema-nullable, optional-chained array reads, chart viewBox coords). 159 → 138 warnings.
- **claude.md lint-status line refresh (Claude) auto-committed by Replit Agent as `9ba2b495` under its attribution** ("Improve linting warnings and update audit documentation with new findings"). Collision pattern #4 — same fingerprint as prior incidents. Work is landed correctly; attribution is here. Per agent-collision-hygiene rule 5: no history rewrite.
- **Progress: 138 warnings, 60% of original 348 cleaned.** Both batches passed all five gates; atomic single-commits per agent-collision-hygiene rule.
- **Plan for remaining:** Haiku (user decision) to execute 5b/6c/6d (mechanical `?? 0`); Sonnet for 5c/6e/6f (assertFinite + Number.isFinite wraps + inspect each).

## Session: April 20, 2026 (late) — OT-A.4 ship + OT-A.5 queued + observability/reorg scaffolding
- **OT-A.4 shipped (Replit, `7da9f25a`).** Four mechanism bugs codified as rules: `field-definitions-no-prescription-hints.md`, `llm-contract-migration-parity.md`, `parity-exemption-classes.md` (+ narrative `.claude/notes/llm-migration-playbook.md`). Pinecone removed 100% across active codebase (`706aec6c`).
- **OT-A.5 drafts approved (Replit).** T+72h observation window runs until 2026-04-22 18:14 UTC. Cross-check finding (`OT-A-5-section-a-crosscheck.md`): v5 test set is all US states → inflationRate reclassified Class 4 → Class 3, Section A anchor dropped from v6 batch.
- **Scaffolding shipped (Claude Code):** Sentry alerts runbook + OT-B Promptfoo scope + ADR-005 workspace reorg (Proposed) + ADR-004 cross-ref closed + SYSTEM-MODEL cost economics refreshed (~$0.70 cold / $0.40-0.50 warm) + 9 active skills/docs swept for post-OT-A.4 stale refs + agent-collision hygiene rule (fourth collision-incident trigger).
- **NaN-coercion fix handoff queued** (`.claude/replit-handoffs/nan-coercion-extractguidance-fix.md`) for post-T+72h. Lint cleanup at 187 warnings (46% done; Batches 1-4/7/8 landed; 5+6 pre-audited pending user Option 1/2/3 call).
- **Next:** await T+72h → authorize v6 rerun + OT-A.5 ship → Sentry/PostHog handoff execution → ADR-004 acceptance unblocks Phase 5A. Eight archived sessions moved to `archive/session-memory-archive.md` to restore 12-session cap.

## Session: April 20, 2026 — Lint warning cleanup plan + ADR-004
- **Lint-cleanup plan drafted** at `.claude/plans/lint-warning-cleanup.md` (Claude Code-owned cross-cutting refactor). 348 warnings categorized: 195 `|| 0` silent fallback (56%), 109 `as any` (31%), 15 `Math.pow`, 9 unused vars, 6 fetch-no-timeout, 14 misc. 8 batches ordered safest-first: unused+Math.pow → `as any` by file → `|| 0` non-financial → `|| 0` financial (highest risk — may expose latent NaN bugs) → timeouts → misc. Per-batch five-gate verification; rollback only on PASS→FAIL regressions not explained by the fix.
- **Key insight:** `|| 0` → `?? 0` is NOT semantically identical (`??` doesn't coerce NaN). Batch 5 expected to surface real bugs we've been silently swallowing. Plan treats test failures after a lint fix as *good* — fix the bug, don't mask it.
- **Done criterion:** `npm run lint` = 0 errors 0 warnings. Realistic ~6–10 sessions at 1–2 batches each.

## Session: April 20, 2026 — ADR-004 verdict cache drafted
- **`docs/architecture/decisions/ADR-004-verdict-cache.md` drafted (Claude, Proposed status):** Content-addressed cache layered over existing `research_runs` + `assumption_guidance` (no new tables — adds `cache_key`, `cache_inputs_hash`, `superseded_at` columns). Two-axis TTL (time + `inputContextHash`). Automatic invalidation on property/global mutation + pgvector reindex. Miss path is stream-through with write-after.
- **Phased plan:** 5A migrations (Replit) → 5B façade read path + engine-client.ts (Claude Code) → 5C write-after + invalidation hooks (Replit) → 5D observability pairs with PostHog handoff (Replit). Multi-tenant persona (N3) unblocked by the shape being persona-hash-agnostic.
- **Expected savings ~80%** at current volume (~$125/day → ~$25/day); primary win is unlocking ambient/cross-portfolio UX that's cost-prohibitive today.
- **SYSTEM-MODEL.md §9 N2 updated** with ADR-004 reference + phased plan. claude.md Phase 5 line points at ADR-004.
- **Next up:** waiting on Replit for OT-A.3 v3 A/B rerun; ADR-004 stays Proposed until human steward accepts; Phase 5A migrations queue after acceptance.

## Session: April 20, 2026 — OT-A.4 shipped + four-mechanism-bug catalog codified
- **OT-A.4 shipped (Replit, `7da9f25a`)** — Path A1: legacy regex extractor retired, `streamObject` + `synthesisOutputToLegacyJson` adapter is the single synthesis path, `USE_AI_SDK_SYNTHESIS=true` by default, `ENGINE_VERSION` v1→v2. Zod validation failures surface as `ORCHESTRATOR_BOTH_FAILED` → single-model fallback engages cleanly. All gates green. Guardrail 1 (grep imports before delete) caught a non-obvious caller: `extractGuidance` in `server/ai/guidance/extractor.ts` consumes the legacy nested JSON shape. Path A1 added an 80-LOC adapter sibling to `toLegacyResearchValuesMap` rather than rewriting extractGuidance — smaller blast radius, future-retirable.
- **Four LLM-migration mechanism bugs now codified:** (1) definition drift, (2) mode collapse [`field-definitions-no-prescription-hints.md`], (3) representational mismatch [`llm-contract-migration-parity.md`], (4) parity-against-broken-baseline [`parity-exemption-classes.md`, four-class taxonomy: industry-standard / legacy-inaccurate / noise-floor / under-reasoned]. Every class has a qualification bar + documented action. Precedent case (OT-A.3 v5 raw) worked through 8 T1 fields to 8/8 adjusted pass.
- **OT-A.5 queued, draft-only this week (Replit).** Three tracks: inflationRate Class 2 verification + promotion, 6 T2 USALI cost-line anchors, 4 non-T1 mode-collapse fields. No API spend — single $22 v6 rerun authorized at T+72h of OT-A.4 production observation.
- **Pinecone removed 100% from active codebase (Claude, `706aec6c`)** — 66 files changed, 3003 deletions (mostly 7 deleted archive directories). Two code shims removed (legacy API redirects + alias fields). Only preserved: user's paste history in `attached_assets/`, Replit's `.local/` session state, and one migration file comment that documents the migration's intent.
- **Docs refreshed:** SYSTEM-MODEL.md §9 N1 → ✅; claude.md OT-A.3/.4 status + four-rule lesson list; this session-memory entry.
- **ADR-004 verdict cache still Proposed.** Awaiting user acceptance to unblock Replit's Phase 5A migrations.
- **Lint cleanup paused at 193 warnings (45% done).** Batch 5 + 6 pre-audited; execution pending user's Option 1/2/3 call.

## Session: April 20, 2026 — OT-A.3 Path 3 structural fail + mechanism bug #3
- **Path 3 failed by structural margin (Replit, offline analysis on v4 data, $0 spend):** severity 13.6% / action 13.6% / range overlap 6% against 95/95/50 gates. Root cause = **representational mismatch** — legacy emits 85% point estimates, new emits 100% ranges. No verdict adapter can bridge that gap; 13.6% is a mathematical floor where legacy point happens to equal new midpoint AND range is tight. A $22 rerun would not have helped.
- **Three OT-A.3 mechanism bugs now catalogued:** (1) definition drift [v1-v2, fixed by FIELD_DEFINITIONS], (2) mode collapse [v3, fixed by stripping typical-range hints + `b8e307dd` rule], (3) representational mismatch [Path 3, codified as rule `.claude/rules/llm-contract-migration-parity.md`]. Three bugs in one migration — LLM-pipeline swaps are harder than expected.
- **Re-spec in flight (Replit):** tiered gate with 8 T1 fields (adr, occupancy, capRate, ltv, incentiveFee, adrGrowth, inflationRate, interestRate — my original seed of 5 was under-inclusive), per-field bucket-match ≥ 55% + midpoint within ±10% relative-to-legacy, with absolute-tolerance fallback when |legacy| < 0.5. T2/T3 fields get wider tolerance. Computed offline on v4 data, no rerun needed. OT-A.4 unblocks when the tiered gate passes.
- **SYSTEM-MODEL.md §9 N1 updated** with current state + three-mechanism-bugs summary. Contract-migration rule adds mechanism bug #3 to the codified-lessons pile.

## Session: April 20, 2026 — Lint batches 1–4, 7, 8 + OT-A.3 mode-collapse discovery
- **Lint cleanup:** Batches 1 (unused+Math.pow, `3e51bd46`), 2 (`as any` low-count, `06b36838`), 3 (`as any` CompanyIcpDefinition full, `af259deb`), 4 (`|| 0` non-financial, `4319061a`), 7 (fetch timeouts, `c4c26c87`), 8 (`as any` 8 high-count files, **bundled into Replit's `9058b1ce`** due to concurrent uncommitted-file collision). **348 → 193 warnings (45% complete).** Batches 5 (financial `|| 0`, ~60) and 6 (remaining `|| 0`, ~50) pending.
- **OT-A.3 mode-collapse found (Replit, `9058b1ce` + `docs/operational-tooling/BLOCKED-ota3.md`):** v3's "wins" were prescription leakage — Opus treated FIELD_DEFINITIONS "Typical X–Y%" hints as strict mandates. Aspen and Outer Banks got identical ramp curves. Bucket-match passed by lucky range coverage, not per-market reasoning. Path 3 would have mechanically passed and shipped a degraded Analyst. Replit stripped cost-seg hints + added anti-collapse system prompt. rampMonths + incentiveFee still carry hints — pending defensive audit pass.
- **Decision tree for next OT-A.3 steps:** Q3 defensive FIELD_DEFINITIONS audit (free, prereq) → Q1 v4 rerun ($22) → Q2 diagnostic analysis (free) → Path 3 authorization. OT-A.4 stays blocked. ADR candidate: rule prohibiting typical-range hints in FIELD_DEFINITIONS with lint enforcement.
- **Cross-agent file collision note:** Claude Code's uncommitted Batch 8 edits got swept into Replit's commit when Replit ran `git add -A` while Claude's files were on disk. Clean enough (work is landed, verified green); attribution lives in session memory since the commit message doesn't mention Claude Code. Future: commit Claude work more aggressively to avoid.

---

## Persistent Decisions & Preferences

- **projectionYears ≥ 2** for revenue growth direction verification
- **Underfunding = info severity** (not material) — business condition, not calculation error
- **DB sync = SQL only**, never code endpoints
- **Seeding errors are ultra-serious** — cascade into calculation failures
- **"Save" not "Update"** on all buttons
- **Every page graphics-rich** — charts, animations, visual elements
- **Every financial line** gets ? tooltip
- **Reusable UI tools** created for all new features
- **Logos vector-based/SVG** with AnimatedLogo wrapper
- **3-level accordion** for consolidated statements (total → formula → per-property)
- **Zero re-aggregation** in render paths — helpers accept precomputed arrays
- **`parseLocalDate()`** for all client-side date string parsing
- **`ExportMenu` variant**: `"glass" | "light" | undefined` only
- **Company unprofitable with 1 small property** — correct behavior (partner comp $45K > fee rev ~$19K)
- **Golden scenario design**: 0% growth/inflation for traceability, hand-values at file top, test both values + identities
- **The Analyst is SINGULAR** — never plural "analysts"
- **Ranges are the product** — quality of range = conviction + data quality score
- **Save = commitment** — after first Save, defaults never overwrite user values
- **AI terms OK when proud** ("AI-powered intelligence"), NOT OK as implementation details
- **App name** = "H+ Analytics". **Company name** = "Hospitality Management Co". **Technology** = "Norfolk AI Engine".

