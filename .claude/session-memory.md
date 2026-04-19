# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last twelve on every session end.

---

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

## Session: April 20, 2026 — SYSTEM-MODEL.md canonical mental model
- **`docs/architecture/SYSTEM-MODEL.md` written (Claude):** 11-section canonical business+technical mental model. Captures dual-entity mechanics (ManCo + SPVs), engine chain (Revenue→GOP→AGOP→NOI→ANOI), Analyst N+1 pipeline, cost economics (~$0.70/consult), 7 open architectural questions, and 11 next steps ranked by leverage (top 3: finish OT-A.3 v3 A/B → ship verdict-cache ADR → multi-tenant persona resolution).
- **Verified engine facts anchored in doc:** `feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate)` at `engine/property/property-engine.ts:174` — incentive fee is % of GOP, not total revenue. Owner priority hurdle gates fee (line 170); subordination defers it (185-195).
- **claude.md Documentation table:** added SYSTEM-MODEL.md as day-one read for new contributors.
- **business-model skill:** pointer to SYSTEM-MODEL.md as companion doc.
- **Next up:** OT-A.3 v3 A/B rerun (Replit, gated on credit top-up); verdict-cache ADR; Sentry + PostHog handoff execution.

## Session: April 19-20, 2026 — Phase 3b + OT-A progression + cross-agent hygiene
- **Phase 3b shipped (Replit, `ee0c6573`):** Funding + Revenue Specialists wrap legacy evaluators via `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null`; `AnalystCheckDialog` consumes the verdict directly; `save_anyway` kept outside the action union (UI-only ghost via `onProceedAnyway`). Persona hardcoded `{L+B, luxury, US}` (single-tenant); resolution + verdict-cache deferred.
- **OT-A.1 + A.2 + A.3 shipped (Replit, `7326e28c`, `aedebc05`, `64b37ca2`, `f1cd4aee`):** Anthropic native prompt caching, Vercel AI SDK + AI Gateway wrapper with BYOK (zero markup), synthesis path behind `USE_AI_SDK_SYNTHESIS` flag.
- **OT-A.3 A/B iteration:** v1 found unit drift (landValue $ vs %); v2 added FIELD_DEFINITIONS but picked textbook semantics for 2 fields; v3 (`cd397044`) re-anchored `rampMonths` + `incentiveFee` to legacy emit semantics. Acceptance gate reframed from aggregate bucket-match to CATEGORICAL (zero unit/denominator/scope errors). OT-A.4 gated on v3 rerun passing.
- **Property tests shipped (Claude, `43ed0163` + `991a6b77`):** 66 fast-check properties across all 10 research tools; 13,200 generated inputs per test:summary.
- **Cross-agent hygiene (Claude, today):** `docs/architecture/DEPENDENCIES.md` atlas (150+ deps); managed-vector-DB → pgvector corrections in core docs; `.claude/skills/analyst/contracts.md` SDK atlas; `.claude/skills/replit-workflow/SKILL.md` — Replit hygiene + what Replit is uniquely positioned to do. claude.md + replit.md refreshed for counts + OT-A phase status.
- **Sentry + PostHog handoffs ready and queued behind OT-A.** `SENTRY_DSN` and `VITE_POSTHOG_KEY` both in Replit Secrets.

## Session: April 19, 2026 — Analyst architecture doc + Phase 1b analyst skills
- **Architecture mental model written (Claude, commit `6fc4d676`):** `.claude/notes/analyst-architecture.md` — 240-line walkthrough of the N+1 orchestrator. Informational only — not a handoff. New `.claude/notes/` directory for knowledge-sharing between agents (distinct from `replit-handoffs/` which is instructional).
- **Pre-commit enforcement rules (Claude, `bcab3620`):** two new rules landed — `pre-commit-verification.md` (the blocking five gates) and `cross-check-invariants.md` (edit → sibling-surface map). Strengthened `claude-replit-split.md` and `testing-strategy.md`. Aim: stop the 40+-bugs-per-audit-sweep pattern.
- **Phase 1a landed (Replit, `68f983fc`, `a230d968`):** architecture spine + 8 per-component specs + ADR-001 under `docs/architecture/analyst/` and `docs/architecture/decisions/`. Zero code change.
- **Phase 1b complete: analyst skills + vocabulary rules landed (Claude).** 14 files under `.claude/`: 12 skills in `.claude/skills/analyst/` (`_index`, `orchestrator`, 6 surface specialists, `cognitive-engine`, `voice`, `quality-scoring`, `steward`) + 2 rules (`analyst-team.md`, `analyst-verdict-contract.md`). All five gates pass: TS 0, Lint 0 errors / 348 pre-existing warnings, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED. Awaiting Phase 2 (engine skeleton + CODEOWNERS + ADR-002) from Replit.
- **Phase 3a complete: AnalystVerdict + Router + Voice + Quality + tests landed (Claude).** 4 source files (`engine/analyst/{contracts/verdict,router/surface-router,voice/voice-renderer,quality/quality-scorer}.ts`) + 4 test files under `tests/analyst/` + ADR-003 + `.claude/rules/analyst-verdict-contract.md` replacement (placeholder → binding). Auto-committed by Replit as `d220f4b1` during editing; my follow-up fixes + ADR + rule replacement land on top. All 53 analyst tests pass; 5 verification gates UNQUALIFIED. Ready for Phase 3b backfill (watchdog evaluators → Specialists, route handler wiring, UI consumption).
- **Phase 6 (service description column) still paused for Replit's re-seed work.** 5B re-index still pending user action (Admin → AI Research → System Health → Re-index knowledge-base).

## Session: April 18, 2026 — CompanyAssumptions audit, Phases 1–5 complete (15 commits across 2 days)
- **Claude (Phases 1–3):** inventory at `.claude/audit-inventory.md` (12 surfaces, 4 drift clusters) → drift repair (D-1 closed: `8f50224a`, `5d4b4111`) → 16-file audit sweep producing 8 findings (tasks #9–#16). Split workflow formalized in `.claude/rules/claude-replit-split.md` (UI/DB → Replit, docs/refactors → Claude); handoffs in `.claude/replit-handoffs/`.
- **Replit (Phase 4 — 8 commits, architect PASS):** `1a131949` + `5bde2ca3` → `c34fb96f`. Two durable lessons: (a) handoff #9 wrongly assumed TS accepts extraneous props on typed components — correct future handoffs of that shape; (b) #15 surfaced a real contract bug — `PortfolioPropertySummary` was missing `isActive` while `PropertyFeeSummaryTable` rendered an "Excluded" badge off it.
- **Replit (Phase 5A citations — `847e1f3a`, `0c3ebc1b`, docs `c58517e9`):** promote `citations.ts` to `shared/citations.ts`, rewire 9 client imports, adopt `CITATIONS` in `server/data/researchSeeds.ts` (capRate/costIT/saleCommission). D-2 closed for exact-match sites; the short `"HVS 2024"` label deferred as a product decision.
- **Replit (Phase 5C capital-raise dates — `6a18d8cf`):** added `DEFAULT_CAPITAL_RAISE_1_DATE` / `DEFAULT_CAPITAL_RAISE_2_DATE` to `shared/constants.ts`; adopted across schema/syncHelpers/dev-seed/Section04 (8 literal substitutions, 1 commit). D-1-B closed.
- **Replit (Phase 5B KB orphan cleanup — `f2c90e04`, `5dd1a5f4`, docs `18679eb7`):** Phase 5B scope was reframed mid-handoff after Claude discovered the entire `server/ai/kb/` directory (added in `640e889f`) was orphaned — never wired into the RAG pipeline. Ported 4 high-value chunks (Founder Background, International Depreciation, Research Workflow, Governed Model Constants) into `server/ai/kb-content.ts` with vocabulary cleanup, then deleted the 19-file directory wholesale (~900 lines). All Phase 5 verification UNQUALIFIED. Re-index pending user action.

## Session: April 17, 2026 — Vocabulary Hard-Rule + Button Rename + Tab-Content Hygiene
- **"Configure Assumptions" button → "Assumptions"** in `client/src/components/company/CompanyHeader.tsx` (single occurrence).
- **Vocabulary hard-rule added** as §0 in `.claude/skills/vocabulary/SKILL.md`: **Assumptions = user-facing working variables**, **Defaults = admin-only seeds**. Different DB columns, different routes, different audiences. Word *"default"* banned from user-facing copy outside Admin. Mirrored to `replit.md` and `.claude/claude.md`.
- **Tab-content hygiene**: `SummaryFooter` was mixing overhead-escalation language with staff-tier language in one paragraph on every tab. Split into tab-aware footer — staffing summary now renders only on Compensation tab, escalation summary only on Overhead tab, no footer on other tabs. **Principle for future agents**: any text that summarizes tab state must live with that tab's concern. Staffing tiers drive compensation, not overhead — never group them by visual proximity.

## Session: April 16, 2026 — Workflow Direction + Operating Model
- **Property-first user journey** confirmed for investor persona (dominant). Properties dimension HMC: portfolio → staffing tiers, property revenue → HMC fee revenue, The Analyst uses research-ready properties as HMC research context.
- **Open forks**: (1) adaptive dashboard with "what to do next" card vs strict wizard; (2) persona branch at first login (investor → properties; founder → HMC) vs universal property-first default.
- **Operating model formalized**: in-session = UI/routing/DB/API/preview-pane work; external Claude Code 4.7 1M shell = multi-file `calc/` refactors, full-test-tree reads, cross-cutting financial logic, deep-research synthesis. Agent flags escalation with self-contained prompt.
- **8-task Company Assumptions session** completed: per-tab save, pulsating Analyst button, post-save validation warnings (multi-year fields de-duplicated per architect feedback), error-code handling for `COMPANY_SETUP_INCOMPLETE` + `PROPERTIES_EXCLUDED`, Partner→Management Compensation rename, depreciation 27.5→39 fix.

## Session: April 15, 2026 — CI Hygiene & Documentation Optimization
- **CI hygiene script** (`script/ci-hygiene.ts`): auto-fixes ESLint unused vars/imports, secret scanner false positives, TypeScript errors. Replit Agent skill at `.agents/skills/ci-hygiene/SKILL.md`.
- **All MD files updated**: test count corrected to ~4,191 (204 files), 178 skills across 19 domains, 25 rules, 498 verify checks. Stale "4,816 tests/202 files/171 skills/18 domains" references fixed across replit.md, claude.md, _index.md, session-memory.md.
- **ESLint** warnings reduced 13→2. `vitest.config.ts` testTimeout: 15s. Health check timeout: 300s.

## Session: April 15, 2026 — Brand Voice, Personas, Intelligence-First
- Brand voice guidelines (`.claude/brand-voice-guidelines.md`) — single source of truth. The Analyst + Rebecca personas, vocabulary enforcement.
- Communication skills (reusable): conversation-principles, ai-agent-voice, norfolk-brand-voice. New domain: communication/.
- Shared utilities: fetchWithTimeout, sanitizeError. PMT copies eliminated → `calc/shared/pmt.ts`.
- user_page_visits table, usePageVisit hook, FirstVisitBanner, AgentPersonasTab.
- 18 KB seeds, dataQuality JSONB on assumption_guidance.

## Session: April 14-15, 2026 — Schema/Tests/Remediation
- 10 `.default()` values, 6 `DEFAULT_*` constants, 8 test fixes (PARTNER→SUPER_ADMIN).
- 11 calc bugs, 7 service bugs, deep security audit (IDOR, prototype pollution, NaN guards).
- 5 CI gates registered. Intelligence pipeline skill. Rebecca personality. PDF export plan (NOT executed).

## Session: March 12, 2026 — Infrastructure Contracts Optimization (12 Workstreams)
- WS1-2: Sealed storage facade — ServiceStorage + NotificationStorage bound to IStorage, `patchGlobalAssumptions` added to FinancialStorage.
- WS3-4: Domain boundaries — 6-domain separation rule + proof test (no route imports db, calc purity, financial isolation from AI SDKs).
- WS6: Constants hardening — `DEFAULT_AI_AGENT_VOICE_ID`, `DEFAULT_STAFF_TIER1/2_MAX_PROPERTIES` extracted to `shared/constants.ts`.
- WS7-8: Tool protection — 36-tool registry rule + proof test, `compute_make_vs_buy.json` schema created.
- WS9-11: 0 TS errors, duplicate hooks eliminated (7 admin tabs → canonical `@/lib/api`), duplicate plaid dep removed, `GlobalResponse` expanded. Tests 2,927→2,940 (127 files, 500 golden).

## Session: March 11, 2026 (cont.) — WACC + Plan Completion
- WACC-based DCF: `compute_wacc` + `compute_portfolio_wacc` tools (33→36 total), `costOfEquity` column, research badges.
- 12 golden WACC tests. All 9 prior workstreams COMPLETE. Tests 2,912→2,927 (125 files, 500 golden).

## Session: March 11, 2026 — Architectural Hardening Initiative (9 Workstreams)
- WS1-6: Magic numbers, golden scenarios, Rebecca chatbot, Admin Diagrams, theme endpoint, password guards.
- Tests 2,842→2,912 (131 files). Health ALL CLEAR. UNQUALIFIED.

## Session: March 9, 2026 — Magic UI Special Effects + ElevenLabs Orb Integration
- Added 9 Magic UI components; `NumberTicker` preferred over `AnimatedCounter`.
- New skill: `.claude/skills/ui/magic-ui.md`.

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

## Session: April 19, 2026 — OT-A.3 structural wiring (commit f1cd4aee)
- Synthesis branch behind USE_AI_SDK_SYNTHESIS env flag (default OFF).
- Schema landed earlier in 595bd061; wiring uses streamObject + AI SDK v6 providerOptions for ephemeral cache_control.
- Five gates GREEN. A/B parity run on 20 inputs is **PENDING USER AUTHORIZATION** — autonomous Opus spend (~\$12-40) was held back. Go/no-go for OT-A.4 deferred until A/B documented.

## Session: April 19, 2026 (cont.) — OT-A.3 A/B parity run (commit 12363142) — DOES NOT PASS
- 11/20 cases captured before Vercel AI Gateway hit insufficient_funds (HTTP 402); top-up required.
- Two clear FAILs even on partial sample: latency regression +190% (vs ≤20% target) + field-name divergence (7/11 cases produce zero shared keys because SynthesisOutputSchema.field is an unrestricted z.string()).
- OT-A.4 BLOCKED. Required remediation: (a) tighten schema to `field: z.enum([...KNOWN_KEYS])`, (b) add field-key contract to system prompt, (c) consider trimming reasoning.max + dropping narrative[] to fix latency, (d) Gateway top-up.
- Structural OT-A.3 commit (f1cd4aee) safe in place; flag default OFF; no production behaviour change.
