# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last twelve on every session end.

---

## Session: April 26, 2026 (latest) — ADR-007 Accepted + G1 packet authored (`3aaf7658`)
- User said "you decide" on Option A vs B for starting G1 → executed Option A (Freeze Gate respected via directive-author override): flipped ADR-007 Proposed → Accepted; updated phases.md G1-G6 owner Replit → CC; updated `_index.md` cross-ref status; converted ADR-007's phase-tracking section from a live table (would have failed `phases:check`) to a pointer at `phases.md`.
- LANDED `3aaf7658` `.claude/replit-handoffs/adr-007-g1-funding-graduation.md` (304 lines) — 6 sub-steps within atomic budget (≤3 source files: prompt-input-builder NEW + funding-specialist.ts REPLACE + specialist-catalog.ts EDIT; ≤2 capability domains). Designed against the §1 10-step Tier-1 skeleton + the verdict-reconstructor seam shipped Phase 5B v2 (`24853904`) + Intelligence Bar 9 requirements. Out-of-scope explicit: Phase 5C write-after (Replit-owned), real LP-comp API integration (canned data v1 stub), voice-renderer "Tier-1 unavailable" badge UI (Replit slice).
- S2 skeleton design: `createFundingSpecialist(benchmarks, options, deps?)` extends the existing 2-arg factory with optional 3rd arg `deps`. **When `deps` is undefined → falls back to Tier-0 immediately** (preserves Phase 3b backward compat for unconfigured call sites). Specialist body imports from `engine/analyst/cognitive/{cache-keys,engine-client,verdict-reconstructor}` only — no `server/` imports per engine→server boundary.
- Verified TS 0, Vocab 11/11, phases:check PASS. Skipped full test:summary + verify:summary per pre-commit-verification.md doc-only carve-out.
- NEXT-SESSION ENTRY POINT: execute S1 — author NEW `server/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` (220-280 LOC pure functions) + `tests/analyst/specialists/funding-prompt-input.test.ts` (≥6 cases). One commit per sub-step per atomic-budget rule. After S1 ships: S2 cognitive wiring (the bigger one — replaces the funding-specialist.ts evaluator body).
- Caveat preserved: `fbb7429d` claimed two auto-memory files were written (`llm_vendor_roster_and_prompt_engineer.md`, `specialist_consolidation_permission.md`) — they DO NOT exist anywhere. Persistence failed or the prior session over-claimed.
- **Auto-memory REPAIRED end-of-session:** wrote 4 entries to `~/.claude/projects/-home-runner-workspace/memory/` (verified by `ls -la` post-write — every file's mtime + non-zero size confirmed): `tier1_graduation_progress.md` (project — G1 state + locks + active packet), `ricardo_decision_style.md` (feedback — act on direction, don't multi-choice), `auto_memory_persistence_failure.md` (reference — the verification protocol so this can't recur silently), `analyst_doctrine_index.md` (reference — pointer jump-list). MEMORY.md index updated. Next session must read MEMORY.md at start.

## Session: April 26, 2026 (earlier, ~23:38 Apr 25 → 00:45 UTC Apr 26) — Doctrine sprint + Phase 5B v2 cognitive verdict reconstruction
- 5 commits, no session-memory hygiene at the time (logged here retroactively). Sequence: `6c1d165f` Intelligence Bar rule (binding floor — N+1, ≥3 cited evidence/dim, comparables tables, range-first) → `edc7dea1` ADR-007 Tier-1 Specialist Graduation (Proposed; G1-G6 ordering, Tier-1 skeleton, fallback policy, cost containment, graduation packet pattern) → `583c4f63` pre-author ADR-004 Phase 5B v2 packet → `fbb7429d` Ricardo's 4 directives codified (NEW `llm-vendor-roster.md`, Intelligence Bar 6→9 reqs adding vendor-breadth/Prompt Engineer/regress+honest-fail, ADR-007 §1 7→10 steps + §2 consolidation permission, NEW CC research/intelligence lane in `claude-replit-split.md`) → `24853904` Phase 5B v2 ship.
- Phase 5B v2 ship: NEW `engine/analyst/cognitive/verdict-reconstructor.ts` (213 LOC pure) — `reconstructDimensionsFromGuidance(rows, inputs, options)` honors ADR-003 invariants 3+4 (numeric non-ok → range required, qualityScore ≥ CONVICTION_FLOOR); low-confidence guidance caps severity at "advisory" + drops range (wider-honest beats narrow-false per Intelligence Bar). User input drives severity at reconstruction (kept out of cache key per ADR-004 §3). + `consultCognitive(req, deps)` wrapper in `engine-client.ts` (HIT returns reconstructed dims + cognitiveRunId; MISS unchanged) + 13 new test cases (28/28 PASS). All 5 gates green.
- Doctrine reinforcements landed in same commit: `the-analyst-persona.md` Forbidden Pattern "engines compute, Specialists analyze" (mirrors Rebecca persona); `business-model/SKILL.md` ManCo framing sharpened to hospitality OPERATOR/BRAND COMPANY (Accor/Marriott/Hilton/IHG ref @ scale; Ennismore/Aman/Six Senses/Hoxton @ mid-lifestyle) + two-investor-pool clarification (ManCo equity vs Property SPV pools usually distinct).
- Out-of-scope (preserved): orchestrator invocation on MISS (caller responsibility per ADR-007 §1 step 4), write-after on new runs (Phase 5C, Replit-owned), voice rendering (Surface Router downstream), `buildAnalystVerdict` invocation (Specialist body), comparables-table data (Specialist's live-API step), catalog reclassification (deferred until G phases).

## Session: April 22, 2026 (latest #3) — P6a: required-fields enforcement at Surface Router (second `_TEMPLATE.md` execution)
- LANDED P6a. Recon caught a contract mismatch in the drafted packet: it specified a synthetic `AnalystVerdict` with `verdict: "incomplete"` / `severity: "info"` — both fields don't exist (frozen by ADR-003). Stopped, flagged 3 reframing options to the user, executed Option 3′ (router throws → handler returns `200 + requiredFieldsMissing[]`, save preserved).
- Wired `withRequiredFieldsGate()` wrapper in `engine/analyst/surface/mgmt-co/index.ts` — wraps each registered Specialist; pre-checks `requiredFields` against payload; throws `RequiredFieldsMissingError` (caught by SurfaceRouter as `SpecialistExecutionError.cause`). Helper `findMissingRequiredFields(payload, names)` exported with semantics: `null|undefined|""|whitespace|NaN` = missing; `0|false` = present. Dot-path resolution supported.
- Route handler in `server/routes/global-assumptions.ts` catches both wrapped + unwrapped error shapes, returns `{ verdict: null, requiredFieldsMissing: [...] }` alongside existing `savedTabs`. Backward-compatible additive field.
- New test file `tests/analyst/required-fields-gate.test.ts` — 9 cases (4 router gate + 5 helper edge). All pass.
- Doctrine note for next packet author: read `engine/analyst/contracts/verdict.ts` BEFORE drafting any verdict-shape change. Severities are `["ok","advisory","warning","block"]` (no "info"); top-level shape is `{ specialistId, generatedAt, overallSeverity, overallQualityScore, dimensions[], voice, meta }` (no `verdict`/`headline`/`body`/`evidenceRefs`).
- Atomic budget: 3 sub-steps / 3 files / 2 domains (route + verification). All 7 gates GREEN.

## Session: April 22, 2026 (latest #2) — P6d: AdminSection ↔ section-id map cross-check (first `_TEMPLATE.md` execution)
- LANDED P6d. Recon found architect's "two places" claim inaccurate — `SPECIALIST_SECTION_TO_ID` is single-source. Real risk was union-vs-map drift (lines 60–66 vs 74–82 in same file). Closed via `as const satisfies Record<string,string>` + derived `type SpecialistSection = keyof typeof ...`. Replaced 7 inline literals in `AdminSection` union with `| SpecialistSection`. Added `in`-guard narrowing at `Admin.tsx:205`.
- New contract test `tests/client/admin-sidebar-section-map.test.ts` (4 cases): URL-safe key format, every value in `SPECIALIST_CATALOG`, every catalog id has sidebar entry, transform reversibility. Catches future catalog↔sidebar drift.
- First end-to-end execution against new `_TEMPLATE.md` discipline. Atomic budget respected (3 sub-steps / 3 files / 1 domain). Packet `.claude/replit-handoffs/phase-6d-section-id-cross-check.md`. P6 parent row in `.claude/phases.md` stays unchanged; flips only when all six P6 sub-packets land.

## Session: April 22, 2026 (latest) — Working-model revision + Plan A skill + Plan C phase-status SoT
- Architect (Opus) evaluated rewrite-churn complaint: root cause is doctrine instability + packet-decomposition gaps, not CC code quality. LANDED rule revision (`claude-replit-split.md`): Pure refactors → explicit-delegation lane via `DELEGATE.md`; Doctrine Freeze Gate (Guardrail #7); Atomic packet budget ≤7 sub-steps / ≤3 files / ≤2 domains (Guardrail #8). Plus packet template `.claude/replit-handoffs/_TEMPLATE.md` (9 mandatory sections).
- LANDED Plan A: NEW `.claude/skills/resources/SKILL.md` (~205 lines, 10 sections — invariants, ResourceKind boundary, add-new-Kind runbook, probe-profile contract, break-glass flow, file map, cross-skill table, "wrong if…" failure modes).
- LANDED Plan C: NEW `.claude/phases.md` as canonical live-status SoT (7-col schema across 7 workstreams: Resources P1-P7, Analyst 1a-5, ADR-004 5A-5C, ADR-005, Audit-Inventory 1-8, Strategic Roadmap 8-13, OT-A/B). Migrated 6 docs (replit.md, resources-control-plane.md, ANALYST.md, ADR-006, audit-inventory.md, MASTER-PLAN-V2.md) to pointers; updated `.claude/rules/documentation.md` priority table + new "Phase status changes" section.
- CI guard: NEW `script/check-phase-status-uniqueness.ts` (run via `tsx` — package.json edit blocked by env policy, so script is invoked directly + documented in documentation.md). Tightened to flag only tables with live status tokens (✅⏳🟡⏸🟢❌/Shipped/Pending/...), exempting checkbox checklists and planned-phase lists. Currently PASSES — `.claude/phases.md` is the only file with a live phase|status table.
- Boundary crossed (CC-domain edits) per user "draft now" + "land a and c" + session-wide "yes". P6 still queued; ADR-005 explicitly paused per architect.

## Session: April 21, 2026 — Resources control plane + P5 Specialist surfaces + doctrine docs
- P5 shipped (commits `2346de7` + `a6c78b54`): `specialist_configs` schema, 6 read-only-by-design REST routes, mgmt-co router config wiring, sidebar restructure, SpecialistPage with capability tabs, 11 contract tests incl. read-only invariant guard. All 5 gates green; 2 audit nits fixed.
- Doctrine formalization landed: NEW `docs/architecture/decisions/ADR-006-resources-control-plane.md` (full v0→v1→v2 evolution + 4 alternatives rejected); `replit.md` Recent Changes + `docs/architecture/resources-control-plane.md` updated with evolution + P5 contract; `.claude/skills/analyst/_index.md` + `surface-mgmt-co.md` got the LOCKED 2026-04-21 governance block.
- Boundary crossed once for analyst skills per user "yes". Architect (Opus) delivered plans for: (a) NEW `.claude/skills/resources/SKILL.md` directive skill (~190 lines, 10 sections), (c) consolidate phase status into `.claude/phases.md` as canonical SoT with CI drift guard. Both awaiting user approval before execution.
- Open: P6 medium follow-ups (required-fields enforcement, audit user-name resolution, runtimeConfig schema narrowing, SPECIALIST_SECTION_TO_ID centralization), Resources adapters for legacy `data_sources`/`LlmDefaultsTab`.

## Session: April 20, 2026 — Interactive Analyst: T009 architect review + conflict-invariant test
- Architect post-T009 review: **PASS**. Core bridge (AnalystFieldSpec + toGuidanceKeys + unionAnalystFieldSpecs) correctly closes the silent no-op; end-to-end usage coherent across violation helper, save-gate, three tab refresh buttons, and Model Defaults union. AnalystViolation shape (field=draftKey + guidanceKey) judged correct.
- Architect suggested three non-blocking enhancements; implemented the smallest one inline: added a conflict-invariant test that fails if the same draftKey maps to different guidanceKeys across tab lists (first-wins dedup could otherwise hide a future misconfig), and within a single tab the same guidanceKey mapping to two different draftKeys (would double-count on Save). Parity tests now 10/10 green.
- Deferred (worth their own slice): (a) integration-level click/assert that tab refresh buttons actually send guidance keys to `triggerRefresh`; (b) typed key registries so mapping drift is a compile-time error — both rightly belong to the property-edit rollout where typed surface-specific unions will be designed up front.

## Session: April 20, 2026 — Interactive Analyst: T009 draft↔guidance adapter landed
- T009 shipped: `AnalystFieldSpec = { guidanceKey, draftKey }` replaces the old plain `string[]` field lists in `client/src/components/admin/model-defaults/analyst-fields.ts`. Added `toGuidanceKeys()` (spec → guidanceKey[] for the refresh API) and `unionAnalystFieldSpecs()` (merges the three tab lists deduped by draftKey — previously `costOfEquity` and `inflationRate` double-counted).
- `computeAnalystViolations` now reads `draft[spec.draftKey]` while matching guidance on `spec.guidanceKey`. `AnalystViolation` gained a `guidanceKey` field alongside `field` (draftKey). `useAnalystSaveGate.fields` switched to `AnalystFieldSpec[]`; handleRerun uses `toGuidanceKeys(fields)`. All three tabs now call `toGuidanceKeys(TAB_FIELDS)` instead of spreading strings.
- Fixes the architect-surfaced silent no-op: before T009, CompanyTab's `salesCommissionRate` was looked up as `draft["dispositionCommission"]` → `undefined`; now the spec bridges the two vocabularies. Same fix pattern for `maxOccupancy` ↔ `defaultMaxOccupancy`, `adr` ↔ `defaultStartAdr`, etc.
- New `tests/analyst/analyst-fields-parity.test.ts` — 9 tests: per-tab draftKey parity against realistic Draft samples, synthetic high-confidence violation triggers the gate per tab, union dedupes by draftKey, `toGuidanceKeys` strips draft vocab, explicit regression guard for the salesCommissionRate↔dispositionCommission mismatch.
- Gates all green: TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED (20 phases/555 checks), Parity PASS, Health ALL CLEAR, Quick Audit no-critical, Exports PASS.

## Session: April 20, 2026 — Interactive Analyst: T008 gates + architect review + T009 queued
- Fixed 2 slice-introduced regressions: `analyst-scoped-runner.ts` was reading `researchConfig.company.llmVendor` / `.llmModel` but that sub-object is `Partial<ResearchEventConfig>` which has no LLM fields. Switched to `researchConfig.companyLlm?.{llmVendor, primaryLlm}` with `researchConfig.preferredLlm` fallback, matching `server/routes/research.ts` pattern. Removed "Ask the Analyst" string from `AnalystActionButton.tsx` tooltip (forbidden-term violation); replaced with "Have the Analyst research this section…".
- All gates green on rerun: TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED (20 phases/555 checks), Parity PASS, Health ALL CLEAR, Quick Audit no-critical.
- Architect review executed (`evaluate_task`, git diff included). Surfaced one real bug: **`analyst-fields.ts` uses guidance-extractor keys (`maxOccupancy`, `dispositionCommission`) but the actual tab drafts use prefixed keys (`defaultMaxOccupancy`, `salesCommissionRate`)** → `computeAnalystViolations` reads `undefined` for most fields → gate silently no-ops. Queued as T009 in `.local/session_plan.md` (plan: `AnalystFieldSpec = { guidanceKey, draftKey }` mapping + per-tab tests). Non-urgent follow-ups also captured (hard-wired scope in `useAnalystRefresh`, extractGuidance vocabulary gap for property keys, cooldown release-on-failure).
- Memory updated: `replit.md` Recent Changes entry extended with T008 + architect findings; this memory entry.

## Session: April 20, 2026 — Interactive Analyst: replit.md docs section landed
- Added full "Interactive Analyst — Admin Defaults slice" section to `replit.md` (before Recent Changes): goal, locked doctrine (60s cooldown, 20% single / 40% lone-blunt thresholds, no cost in tooltip), client primitives (AnalystActionButton, useAnalystRefresh, computeAnalystViolations, useAnalystSaveGate / SaveWithAnalystGate), server surface (`POST /api/analyst/refresh`, `runAnalystScoped`, reused `GET /api/guidance/company/:userId`), wired surfaces (3 sub-tabs + union-scoped save gate), what's skipped by design, what's deferred.
- Appended "Recent Changes" entry summarizing T003–T007b in chunk order.
- Remaining T008 work: gates (Lint/Tests/Health all still red pre-existing — triage at gate time), architect review.

## Session: April 20, 2026 — Interactive Analyst: T007b gate wired into ModelDefaults
- **T007b**: Refactored `SaveWithAnalystGate.tsx` to expose `useAnalystSaveGate` (returns `{ requestSave, dialog, violations, shouldInterrupt }`) + kept the wrapper component for local-save surfaces. `ModelDefaultsTab.tsx` uses the hook, unions the three populated sub-tab field lists into `ALL_MODEL_DEFAULTS_ANALYST_FIELDS`, lifts `requestSave` (not the raw save) through `onSaveStateChange`, and renders the dialog at the bottom.
- **Next (T008)**: docs update in `replit.md`, run all gates (TS/Lint/Tests/Verify/Parity/Health), architect review.

## Session: April 20, 2026 — Interactive Analyst: T007a soft-gate primitives
- **T007a**: `computeAnalystViolations` pure helper (thresholds 20% single / 40% lone-blunt, high-confidence only, nearest-edge metric) + `<SaveWithAnalystGate />` dialog component. Dialog offers Cancel / Save Anyway / Analyst ✨; tracks `awaitingRerun` so only in-dialog reruns auto-close on success. Barrel updated.
- **Next (T007b)**: wire `<SaveWithAnalystGate />` into `ModelDefaultsTab` — scope `fields` to the active sub-tab (union for all-tabs save, or per-tab if we split). Current save contract lifts `onSave` via `onSaveStateChange`; we'll route that through the gate.
- Lint/Health/Run-Tests still red pre-existing; gates at T008.

## Session: April 20, 2026 — Interactive Analyst: T006 complete (a + b)
- **T006b**: MarketMacroTab + PropertyUnderwritingTab wired to the same `useAnalystRefresh` hook via shared parent state; each renders `<AnalystActionButton variant="header" testIdSuffix="market-macro"|"property-underwriting" />` next to its `TabBanner`, firing its canonical field list from `analyst-fields.ts`. ModelConstantsTab/LlmDefaultsTab/RequiredFieldsTab skipped per plan.
- **Next**: T007 soft-gate (`<SaveWithAnalystGate />`) — high-confidence + >20% out-of-band violations; ≥2 always interrupts, 1 only if >40%.
- Lint Check still red pre-existing; gates run at T008.

## Session: April 20, 2026 — Interactive Analyst: T006a plumbing landed
- **T006a**: `useAnalystRefresh` hook (POST `/api/analyst/refresh`, local 60s cooldown clock synced with server `retryAfterMs`, query-key invalidation, toasts); per-tab field map at `analyst-fields.ts`; parent (`ModelDefaultsTab.tsx`) fetches `/api/guidance/company/:userId` (admin-gated) and plumbs guidance + refresh primitives down; CompanyTab pilot renders `<AnalystActionButton testIdSuffix="company" />`.

## Session: April 20, 2026 — Interactive Analyst: T003 button + T004 runner + T005 admin route
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

