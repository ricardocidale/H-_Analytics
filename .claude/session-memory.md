# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last twelve on every session end.

---

## Session: May 1, 2026 — Assumption export pages (PDF/Excel/CSV) + seed optimization

- **Assumption pages shipped E2E** in 4 commits (`803888da` A → `da886f94` B → `dc0451c7` C → this D). Live in PDF/Excel/CSV; skipped in PPTX/DOCX. Single-property = 2 pages (ManCo + property); company = 1; portfolio = (N+1). New file `server/report/assumption-sections.ts` (helpers + `ASSUMPTIONS_TITLE_PREFIX` constant). New proof test `tests/proof/assumptions-export-completeness.test.ts` (8/8 PASS) guards drift via FIELD_REGISTRY iteration.
- **Pipeline audit:** Confirmed `USE_SERVER_EXPORTS = true` is hard-set; live path is `/api/exports/generate` → `compileReport` → format generators. Client-side `propertyDetailExports.ts` is dead under flag. Title-pattern `"Assumptions — <Entity>"` is the load-bearing contract — discriminates without polluting the `ReportSection` type.
- **Surprise:** PNG export NOT actually wired in live pipeline (`ServerExportFormat = "pdf" | "xlsx" | "pptx" | "docx" | "csv"`). The "PNG zip" in `.claude/rules/exports.md` is aspirational.
- **Seed adjustments earlier in session:** Medellín Duplex hotel→STR (`8b9b10ec` — 4 rooms→1 unit, $1K→$1.2K, 0% svc shares, 15% platform commission, 30-50% occ); ManCo partner comp Y1-3 ramp (`92bd98b9` — $540K flat→$360/$420/$480K).
- **All 5 gates PASS after each of A/B/C/D.** Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED.

---

## Session: April 30, 2026 (later) — Skills audit + skill-path proof test + P7-C close

- **P7-C closed** (`76525c11`, `9720d72c`): H–K Constants Specialists status flipped `"needs-page"` → `"built"` after Replit shipped `ConstantsOwnedCard.tsx` (`03d5ceb7`). Updated both exempt sets in sync — `VERDICT_DIMENSION_EXEMPT` (`tests/proof/specialist-intelligence-bar.test.ts`) and `BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS` (`tests/analyst/voice/field-registry-parity.test.ts`).
- **Skills audit** (`a3485608`): 18 broken `.md` path references fixed across `context-loading/SKILL.md`, `design-standards.md` (rule), and 6 other files — all consequence of skills moving into subdirectories without the routing layer following. 15 previously-invisible skills (analyst/, resources/, session-plans/) added to `_index.md`. Two pre-ADR planning docs (`research-intelligence-redesign.md`, `research-intelligence-strategy.md`) archived — both used forbidden "Regenerate Research" vocabulary and pre-dated current Analyst architecture.
- **Skill-path proof test shipped** (`74f54846`): `tests/proof/skill-paths.test.ts` scans every backtick-quoted `.md` reference and asserts existence on disk. TDD red-phase verified by deliberate broken path. Surfaced 20 additional broken refs beyond the manual audit (api-routes, no-hardcoded-assumptions → no-hardcoded-values rename, market-intelligence/SKILL.md → research/market-intelligence.md, tour/SKILL.md → ui/tour.md, etc.). Compound engineering investment defending today's audit forever.
- **CI triage** confirmed all 5 Replit workflows (Health Check, Magic Numbers, Quick Audit, Run Tests, Verify Financials) PASS locally. Replit's "pre-existing failing" reports were stale/transient — pthread_create exhaustion in their parallel runner, cleared during session.
- **Compound engineering memory writes:** `feedback_analyst_vocabulary.md` ("Analyst" not "Ask The Analyst") + `feedback_superpowers_triggers.md` (when to invoke each `superpowers:*` skill) + `MEMORY.md` index. Two discipline lessons now survive session boundaries.

---

## Session: April 30, 2026 — Quality sweep + market data backend + IB proof gate

- **validateSynthesisOutput sweep** (`22dd9e91`, `9cd2fb85`): All 7 synthesis validators (A, B, D, M, N, O, P + property-risk) now enforce `TIER_1_MIN_TOTAL_EVIDENCE` total-evidence floor (ADR-003 invariant 7). Check #5 fires when comparables ≥ 3 but total valid refs < 3.
- **specialist-intelligence-bar.test.ts** (`9cd2fb85`): 23-test proof gate — R5 (api assignmentRef), R9 (validator file exists), R9+ (TIER_1_MIN_TOTAL_EVIDENCE import). Completeness gate catches uncovered built specialists immediately.
- **Literal drift cleanup** (`9cd2fb85`): `constants-compensation-benchmarks.ts` + `constants-revenue-benchmarks.ts` — 5 bands → 15 named `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constants each. Company/Overhead/PropertyDefaults were already correct (written post-doctrine).
- **Market data backend** (`7bd5583f`): `GET/POST /api/admin/market-data-tables/*` routes + `regenerate-market-data.ts` (web search + Claude extraction → upsert for 5 tables). P7-D UI packet written; Replit executing now.
- **P7-C packet written** (`9a365479`): ConstantsOwnedCard for H–K constants specialists (not yet given to Replit). CC follow-up after Replit lands UI: flip catalog status "needs-page" → "built".

## Session: April 30, 2026 — P7-B Property-Defaults Specialist (Paula / P) full Tier-1 graduation

- **P7-B complete.** Property-Defaults (Paula / P, id `mgmt-co.property-defaults`, 16th specialist) all 3 phases shipped: Phase 1 `4cb664b9` (Tier-0), Phase 2 `43541a0e` (N+1 runner + route branch + magic-numbers re-snapshot 137/2428), Phase 3 `fc5d8c99` (25 IB bench tests). P7-B now fully shipped; phases.md stamped.
- **4 fraction dims:** eventExpenseRate, otherExpenseRate, utilitiesVariableSplit, salesCommissionRate. Evidence prefix `"PropertyDefaults:"`, runId prefixes `property-defaults-p2-` / `pe-property-defaults-p2-`. salesCommissionRate naming ambiguity (schema=exit commission, specialist=OTA commission) accepted as Phase 1 design; reads `ga.salesCommissionRate` directly.
- **2 TypeScript fixes during Phase 2:** `AiIntelligenceSection` Record missing new section key (fix: add entry); `computeInputContextHash("property-defaults")` invalid enum (fix: `"company"`). Rule-compliance fix: `"Urban Boutique Hotel B"` → `"Urban Boutique Property B"` (forbidden admin string). All gates green at every commit.
- **Next workstream:** P7-C — Constants Specialists H–K admin pages. Replit handoff packet needed.

---

## Session: April 30, 2026 — P7-B Company Specialist (Olívia / O) full Tier-1 graduation

- **Company Specialist (Olívia / O) all 3 phases shipped:** Phase 1 `2588f4fd` (Tier-0), Phase 2 (N+1 runner + 6 prompt/schema/validator files + route branch + magic-numbers re-snapshot), Phase 3 IB bench `eaebd3fa` (25 tests, 4 fraction dims). Critical distinction: all 4 dims are fractions (0.08=8%), unlike Overhead's USD integers — fraction-enforcement baked into every prompt with `# Output scale — CRITICAL` section and `high ≤ 2` schema guard.
- **Company 4 dims:** baseManagementFee (fraction of revenue), incentiveManagementFee (fraction of GOP), companyTaxRate (effective combined rate), costOfEquity (DCF hurdle). Evidence prefix `"Company:"`, runId prefixes `company-p2-` / `pe-company-p2-`.
- **All 5 gates green at every commit.** Magic-numbers baseline re-snapshotted after Phase 2 (135 duplicated values, 2331 occurrences).
- **Next:** P7-B Property-Defaults Specialist (P) — 4 dims: eventExpenseRate, otherExpenseRate, utilitiesVariableSplit, salesCommissionRate. Mount point: defaults/property → PropertyUnderwritingTab. Same 3-phase pattern.

---

## Session: April 30, 2026 — P7-B Overhead full graduation (Natália) + range-shaped defaults doctrine

- **Doctrine firmed** at `7284d428`: constants-vs-defaults skill + no-hardcoded-values rule both gained a "Range-shaped defaults" section codifying the binding naming convention `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` for Specialist watchdog reference bands. Trigger: user feedback while building Overhead Phase 1 ("you are creating magic numbers instead of default values to be seeded" + "default values are values to be used as seed values"). Defaults are now framed explicitly as SEED values, not just runtime fallbacks.
- **P7-B Overhead Specialist (Natália / N) full Tier-1 graduation** shipped this session: Phase 1 `3a173ee9` (Tier-0 watchdog + 6 tracked dims), Phase 2 `495803ee` (full N+1 — PE + parallel quant/market panels + Opus synthesis + bounded regress, mirrors Compensation G3 verbatim), Phase 3 in this commit (25 IB bench tests + overhead-comp-dataset api assignmentRef). 14 specialists total (letter N added). 6 dims all USD: officeLeaseStart, professionalServicesStart, techInfraStart, businessInsuranceStart, travelCostPerClient, itLicensePerClient.
- **Pre-existing debt flagged for follow-up:** `shared/constants-compensation-benchmarks.ts` and `shared/constants-revenue-benchmarks.ts` still embed inline numeric literals inside their band objects. Sweep to lift them into `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constants is its own packet — not blocking forward progress.
- **Latent gap (matches Funding/Revenue/Compensation pattern):** `validateSynthesisOutput` does not enforce ≥3 evidenceRefs per non-ok dimension across Funding/Revenue/Compensation/Overhead. Worth patching in one cross-specialist sweep when convenient; not blocking.
- **Next:** P7-B Company + Property-Defaults Specialists. Each follows the same 3-phase pattern (foundation → N+1 graduation → IB bench).

---

## Session: April 30, 2026 — P7-A + P7-B Compensation shipped (Mariana M / G3)

- **P7-A Revenue G2** shipped earlier in session: plan `c407d5a9` → G2 N+1 `2f1a649c` → IB bench + api assignmentRef `6a7cf08c`. Convergence threshold 55, mirrors Funding G6-P3b verbatim.
- **P7-B Compensation Specialist (Mariana / M)** shipped: Phase 1 (Tier-0 foundation) `889dcd59`, Phase 2 (G3 N+1 graduation) `36db0f45`, Phase 3 (IB bench + api assignmentRef + phases.md) `05789a2a`, Voice Renderer unit hardening `f202b146` (explicit `partners` / `FTE` cases lock precision contract). 13 specialists total in catalog now (letter M added to SPECIALIST_LETTERS).
- **All 5 gates green at every commit.** Magic-numbers baseline re-snapshotted twice this session (Revenue G2 + Compensation Phase 1 + Phase 2) — legitimate domain-data growth, not duplicated logic.
- **P7-B remaining:** Overhead, Company, Property-Defaults. Each follows the same 3-phase pattern (foundation → N+1 graduation → IB bench). Build order: Overhead → Company → Property-Defaults (simpler tabs first).
- **Latent gap (matches Funding/Revenue pattern):** `validateSynthesisOutput` does not enforce ≥3 evidenceRefs per non-ok dimension across all three Specialists. Worth patching in one cross-specialist sweep when convenient; not blocking.

---

## Session: April 29, 2026 (P6e-c + P6g shipped; P6f scoped)

- **P6e-c + P6g shipped** by Replit at `7a4efea2`: N+1 Orchestrator Defaults section in LlmDefaultsTab.tsx (4 dropdowns → pipeline policy) + Recommended badges + AnalystButton in LlmConfigTab.tsx.
- **CC cleanup** (`9dc6b2a3`): removed 4 stale P6e entries from `BASELINE_DRIFT` (migration ran, columns exist now); fixed specialist test assertion from "gemini-2.5-flash" → "gemini-2-5-flash" (Replit normalized slugs in source but test still expected period form).
- **P6f scope confirmed:** seed `admin_resources` with model resources (slug: "gemini-2-5-flash" — no periods; API name goes in config.modelId) + API/source rows from source_registry. DB currently has 0 model rows. No packet drafted yet.
- **All gates green** at `9dc6b2a3`: TS 0, Lint 0, Vocab 11/11, test:summary PASS, verify UNQUALIFIED.

---

## Session: April 29, 2026 (P6e-a close) — resolveLabel kind guard + test coverage

- **P6e-a fixes** (`22e70617`): `resolveLabel` in `getSpecialistGlobalLlmDefaults` now checks `row.kind === "model"` before returning displayName — prevents non-model resource leaking into model field. +3 tests covering ID-based label resolution, all-four-IDs path, and kind-mismatch fallback. Schema-drift BASELINE_DRIFT entries annotated with TODO(P6e) cleanup note.
- **P6e-a status: COMPLETE.** All 22 resolver tests pass. TS 0, Lint 0, test:summary PASS, verify UNQUALIFIED.
- **Next:** Replit executes `phase-6e-llm-defaults-adapter.md` (N+1 section in LlmDefaultsTab.tsx), then `phase-6g-llm-tab-recommendations.md` (Recommended badge + AnalystButton in LlmConfigTab.tsx).

---

## Session: April 29, 2026 (P6g server + handoff) — recommendedModelSlugs wired

- **P6g CC work done** (`b6f44d2c`, `cab8b5e4`): `engine/analyst/registry/recommended-models.ts` (new) — `RECOMMENDED_MODEL_SLUGS_BY_ROLE` from vendor-roster; `SpecialistConfigPublicViewSchema` + `toConfigView` + `SpecialistConfigView` client type all get new `recommendedModelSlugs` field.
- **Handoff written** (`3d4b0399`): `.claude/replit-handoffs/phase-6g-llm-tab-recommendations.md` — 2 sub-steps for Replit: S1 "Recommended" badge in each model dropdown, S2 AnalystButton → invalidate models query (data refresh only, no LLM call).
- **All gates green** after each commit: TS 0, Lint 0, 40/40 admin-specialists tests, test:summary PASS, verify UNQUALIFIED.

---

## Session: April 29, 2026 (continued) — P6c-a shipped + P5C-task-2/3 shipped

- **P6c-a complete** (`ae422cff`): `engine/analyst/registry/specialist-runtime-schemas.ts` (new) — `PhotoEnhancerRuntimeConfigSchema` (Zod strict) + `SPECIALIST_RUNTIME_SCHEMAS` registry. `server/routes/admin/specialists/runtime.ts` — 16KB size cap + depth-4 cap + per-Specialist Zod validation on PUT. `tests/server/admin-specialists.test.ts` — +7 bar tests (Photos accept/reject, size cap, depth cap). All gates green.
- **P5C-task-2/3 complete** (earlier in session, `6302e621`): `markAssumptionGuidanceSuperseded` on `ProposalsStorage`; wired into `server/routes/properties.ts` + `server/routes/global-assumptions.ts` (PUT + save-tab) on `hasKeyChange`.
- **P5C-task-1** shipped in collision commit `9fb9083e` (see prior entry).
- **Pending:** P6e (LLM defaults → admin resources adapter, blocked on P6c), P6f (legacy data-sources adapter).

---

## Session: April 29, 2026 — Phase 5C-task-1 shipped (cache key write-after); Replit EWW+ICP complete

- **Replit completed** both handoff packets: `9fb9083e` — ADR-009 EWW dedup (3 UI income-statement surfaces) + ICP model dialog verify. Both verified by Replit per packet acceptance criteria.
- **Phase 5C-task-1 shipped** (collision note below): `analyst-scoped-runner.ts` now imports `computeCacheKey`, `computeInputContextHash`, `canonicalJson` from `cache-keys.ts` + `ENGINE_VERSION`. After the cognitive run completes and `runId` is set, computes `cache_key` + `cache_inputs_hash` using `CompanyCacheInputs` from ga + `producedFields` from `guidanceResult.records`. Writes via `updateResearchRun(runId, { cacheKey, cacheInputsHash })` wrapped in a non-fatal try/catch. TS/lint/test/verify all green.
- **Collision note:** commit `9fb9083e` (Replit's EWW packet) bundled CC's `analyst-scoped-runner.ts` Phase 5C edits. Attribution lost in git; work is correct and intact. Per agent-collision-hygiene rule — no history rewrite.
- **Next up (CC):** Phase 5C-task-2/3 — mutation superseding: when property or global-assumption is saved, set `superseded_at` on stale `assumption_guidance` rows.

---

## Session: April 28, 2026 (G2-v1 + G1.6-v1 close) — both analysts fully wired end-to-end

- **G2-v1 fully closed:** Revenue Specialist server (`80df7bbc`) + UI wiring (`62a664fc`). `<AnalystButton>` live on PropertyUnderwritingTab routing to `specialistId:"mgmt-co.revenue"`. No more "Replit follow-up" in phases.md.
- **G1.6-v1 fully closed:** `useAnalystRefresh` extended with `propertyId` + `"property"` scope union (`5c4fcc5a`). PropertyEdit hook updated to `scope:"property"` + `specialistId:"property.risk-intelligence"` + `propertyId`. TS/lint/vocab/test/verify all green.
- **Seeds confirmed auto-seeded:** `seedPass12Updates()` (CY/NL/AT rows) is wired into `seedReferenceRanges()` which runs at server startup — no manual `POST /api/admin/seed-production` needed.
- **CodeRabbit smoke-tested:** test PR #14 opened 2026-04-28; both CodeRabbit + ClaudeBot fired via email confirmation. Auto-review working. Docs commit `a6bf3e11` landed on main.
- **Next up:** G6-P2 (Funding N+1 panels) or G3 (Risk Intelligence graduation).

---

## Session: April 28, 2026 (final audit) — Full 30-commit window audited; EWW + Pass 12 + CodeRabbit verified

- **Audit complete (0cc880b3..f581a081):** 4 domains checked. Engine PASS: `expenseEWW` computed at property-engine line 141, checker passes through, yearly aggregator derives `expenseUtilities = var + fixed` (lines 227 & 387), all 5 client EWW rows bind to `expenseUtilities` or inline equivalent. Seed PASS: Pass 12 has **19 rows** (session memory previously said 25 — that was an early estimate error, not a code bug). All 19 values accurate and well-sourced. CY CIT low/mid=12.5% ✓; NL/AT additions are VAT+RETT (not CIT — never expected). CodeRabbit PASS: all 8 config checks, pointer doc intact. Commit window PASS: zero console.log/as any/||0 in financial files, vocab clean, no TODO/FIXME.
- **What shipped this session:** Cyprus CIT fix (`f597fdb7`); ADR-009 Phase 1 EWW UI (CC `fb29bf68`, Replit `40a26ba8` — identical, benign collision); Replit added EWW to `IncomeStatementTab.tsx` + `statementBuilders.ts` (`f581a081`); CodeRabbit org-wide install verified (`60bf79ea`); `CODE_REVIEW_BASELINE.md` updated. Total: 30 commits on `main`.
- **Pending — run seeds:** Pass 12 rows NOT yet in Neon DB. Run `POST /api/admin/seed-production` from Admin UI. Verify: `SELECT COUNT(*) FROM reference_range WHERE country IN ('CY','NL','AT')` → 5 rows (CY×3 + NL×2 + AT×1).
- **CC next session:** (1) Extend `resolveMarketBenchmarks()` for `payroll-tax-employer` lookup (ES/IT/GR/CY/NL) → Daniela prompt. (2) `tests/seeds/reference-range-pass12.test.ts` (assert 19 rows post-seed). (3) G2-v1 Revenue Specialist (unblocked since G1.5c soaked).
- **Audit finding — minor:** `propertyExportShared.ts` EWW row uses inline `y.expenseUtilitiesVar + y.expenseUtilitiesFixed` vs `y.expenseUtilities` elsewhere — mathematically equivalent, no action required.

---

## Session: April 28, 2026 (earlier) — G1.5c closed; Daniela (property.risk-intelligence) route handler wired; admin-link test fixed

- **What shipped:** (1) G1.5c closed — S6 passed (`1addc5bf`) + 4 audit findings fixed (`2d46c186`) — phases.md updated. (2) G1.6-v1: `POST /api/analyst/refresh` extended with `scope:"property"` + `propertyId` + `property.risk-intelligence` branch (`runPropertyRiskIntelligenceV1Path`); UNWIRED comment removed from runner. (3) `property-edit-depreciation-band.test.tsx` admin-navigation test removed (violated user's "no front-of-app→admin links" rule). All five gates green.
- **Key files changed:** `server/routes/analyst-admin.ts` (added imports + schema extension + Daniela branch + 3 helpers), `server/ai/specialists/property-risk-intelligence-runner.ts` (UNWIRED comment removed), `tests/client/property-edit-depreciation-band.test.tsx` (removed admin-nav link test), `.claude/phases.md` (G1.5c ✅, G1.6-v1 ✅, G2-v1 soak note).
- **Replit follow-up needed (UI lane):** Update `PropertyEdit.tsx` placeholder — change `scope:"global-assumptions"` + `specialistId:"mgmt-co.funding"` to `scope:"property"` + `specialistId:"property.risk-intelligence"` + `propertyId:{id}`. Update `useAnalystRefresh` to accept + forward `propertyId`.
- **G2-v1 (Revenue Specialist):** Unblocked — G1.5c ✅ + 1 session soak passed. Ready to start next session.
- **Railway PR:** Replit opened a Railway PR this session — review pending.

---

## Session: April 27, 2026 — v1 Funding Specialist shipped; Gaspar fixed; OTA4 cleanup done

- **What shipped:** v1 Funding Specialist E2E (S1-S5): Zod schema, prompt builders, `runFundingSpecialist` runner, 17 unit tests (CI-safe stubs), route branch in `analyst-admin.ts`. Gaspar (research-orchestrator) synthesis fixed: swapped `getAiSdkAnthropic()` (Vercel Gateway) → `createAnthropic()` from `@ai-sdk/anthropic`. Root cause: Gateway requires `AI_GATEWAY_API_KEY` not set on Railway/Replit. OTA4 cleanup: deleted `ai-sdk-clients.ts` + smoke test (both self-described as OTA4 throwaways). Predeploy storage reconcile workflow: removed push trigger (secrets not configured → every push was failing).
- **Commits this session (HEAD = `38b0290e`):** `9c3da43a`→`7d8a0be3` (v1 S1-S5), `2078f71a` (db-url empty-string fix), `ee3a5540` (pnpm db:push arg fix), `ed816bc9` (test Gateway stub), `960b672e`+`1aa6bdeb` (CI test fixes), `9505c619` (Gaspar fix), `2f94ee36` (OTA4 cleanup), `38b0290e` (phases.md). All five gates green on every commit.
- **Blocking Ricardo:** G1.5c-S6 = manual gate: click AnalystButton on Funding tab 5+ times, each verdict must be investor-grade (Goldman Sachs research level). If any fall short, iterate prompt in `mgmt-co-funding-prompt.ts` and re-review.
- **Cathedral roadmap preserved:** G6-P2 (N+1 panels), G6-P3 (cache+regress+live comps), G6-P4 (full Tier-1). See auto-memory `funding_v1_graduation_roadmap.md`.
- **Replit lane confirmed:** UI/UX only per 2026-04-27 directive. CC owns engine, server/ai, routes, schema, seeds, tests, doctrine, scripts, config.

---

## Session: April 26, 2026 (latest) — G1.5a shipped + G1.5b-pre packets authored (RESUME POINT)

> **RESUME POINT for this session.** Read `~/.claude/projects/-home-runner-workspace/memory/g1_saga_resume_point_2026-04-26.md` FIRST in next session — it has the full decision tree and key-file map. This entry is the session-history summary; the auto-memory is the actionable resume guide.

- **Where we exactly stopped:** HEAD `origin/main` = `879cf6a5` (G1.5b-pre packets pushed). G1.5a engine code shipped end-to-end (`71ebbb9e..efc9b522`); G1.5b-pre packets (parent + 2 children) authored, awaiting Replit execution. G1.5b cascade packet NOT YET authored — gated on G1.5b-pre completion (the new save-tab response shape will inform G1.5b's design).

- **The arc this session covered:** (1) Replit's BLOCKED report `64701f7b` revealed CC packet-author defect — G1's verification spec asked for `meta.fallbackReason / vendorsUsed / cacheState` against a contract that didn't allow them. (2) Ricardo flagged separate Defaults vs Assumptions architectural violation — 5 Funding fields (`runwayBufferMonths` etc.) live only as benchmarks; no Default/Assumption surface. (3) Plan: Option A doctrine-first sequential. (4) ADR-008 written + Accepted; CC executed G1.5a (7 sub-steps, 5 gates green per commit). (5) Mid-session, Ricardo bound new rule "Analyst is never auto-triggered — button only." (6) CC saved feedback memory + wrote `.claude/rules/analyst-trigger-discipline.md`. (7) Audit found 3 violation surfaces (save-tab dispatch, `?analyst=1` deep-link, `useAutoRefreshIntelligence`). (8) CC authored G1.5b-pre parent + 2 children for Replit. STOP.

- **3 agent collisions this session** (per `agent-collision-hygiene.md`): `074e44ba` (Replit's SaveButton/Company tab UI commit swept up CC's ADR-008 status flip + phases.md edit); `da3f0afa` (Replit's storage hygiene commit swept up CC's S5 Tier-0-backward-compat assertions); `508b282d` (Replit's parallel S5-equivalent for fallback-paths block). Net effect: all intended work landed; attribution lives here + in the resume-point auto-memory entry.

- **3 doctrine artifacts shipped this session:** ADR-008 (`fd4c265f` Proposed → `074e44ba` Accepted) extending `AnalystVerdictMetaSchema` with 3 tier-coupled optional fields; `.claude/rules/analyst-trigger-discipline.md` (`e1701082`) binding button-only trigger rule; G1.5b-pre packet trio (`879cf6a5`) for Replit handoff.

- **Auto-memory updated end-of-session:** wrote `g1_saga_resume_point_2026-04-26.md` (project — 12.5KB, comprehensive); `analyst_trigger_discipline.md` (feedback — Ricardo's binding rule); reused `defaults_vs_assumptions_three_tier.md` (feedback — earlier this session). MEMORY.md index updated with all three. Verified by `ls -la` post-write.

- **NEXT SESSION ENTRY POINT:** read MEMORY.md first → read `g1_saga_resume_point_2026-04-26.md` → `git fetch && git log --oneline 879cf6a5..HEAD` → check Replit's progress on G1.5b-pre packets → branch decision per the auto-memory's Step 3 decision tree.

---

## Session: April 26, 2026 (earlier) — G1 packet executed end-to-end (S1–S6 shipped)
- G1 Funding Tier-1 graduation packet now substantively complete. Commit chain: `6f4696ba` S1 (prompt-input builder + tests) → `71061c1d` S2+S5 (cognitive skeleton + fallback tests) → `8ba81dfd` S3 (lp-comp-dataset assignmentRef) → `9a461f92` S4 (persona-keyed golden bench) → `ae2a16e7` S6 (catalog Tier-1 graduate annotation).
- S6 caveat: annotation comment landed but `ae2a16e7` lacks the packet's required `Surfaces:` + `Packet:` footers. This entry IS the procedural closure — the substantive S6 work (the comment) is intact at `engine/analyst/registry/specialist-catalog.ts` line 33. Schema has no `tierMinimum` field, so no schema work required (per S6's commit-message-only fallback).
- Post-merge behavioral verification (manual, dev-server) still pending: Funding tab Save → confirm `meta.cognitiveRunId` present (Tier-1) OR `meta.fallbackReason: "tier1_unavailable"` (Tier-0); ≥2 vendors in `meta.vendorsUsed`; cache HIT vs MISS via `meta.cacheState`. These steps live in the packet under "Behavioral verification (manual, post-merge)".
- Surfaces touched across G1: S-Analyst-Verdict, S-Cognitive-Cache, S-Resources-Catalog, S-Analyst-Tier0-Fallback. Packet: `.claude/replit-handoffs/adr-007-g1-funding-graduation.md`.

## Session: April 26, 2026 (earlier today) — ADR-007 Accepted + G1 packet authored (`3aaf7658`)
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

## Session: April 27, 2026 (post-decision) — v1 architectural pivot + Replit UI handoff

- **Ricardo deep-think on cognitive architecture (in response to CC's BLOCKED escalation):** "trying to predict what will happen before user does anything is difficult." Specialists + Orchestrator activated by AnalystButton press only. Save = commitment; Cancel = drafts lost. Prerequisites checked at button-press time → if missing, dialog over the page tells user what's needed before the Analyst can move forward.
- **Quality bar (binding):** "highest possible intelligence to the user or Analyst becomes irrelevant and users won't click on it for help." Translates to: invest in prompt + context; layer N+1/cache/regress as quality graduations later.
- **Architectural pivot:** abandon the original Tier-1-cathedral split (b: orchestrator wrap + c: route slice). Ship v1 = single-shot Opus + EXCEPTIONAL prompt + rich context. Layer N+1 (G6-P2), cache (G6-P3), live comps (G6-P3) as follow-ups. ADR-007 Tier-1 graduation becomes a continuous quality cadence, not a single monolithic ship.
- **New packet structure:**
  - DELETED `g1.5c-tier1-deps-b.BLOCKED.md` (decision made)
  - `g1.5c-tier1-deps-b.md` and `-c.md` SUPERSEDED (kept on disk for audit; parent index marks them deprecated)
  - NEW `g1.5c-v1-funding-specialist.md` — the v1 build packet (5 files, 6 sub-steps, single-shot Opus + rich context + strict schema + tests + route wiring + manual prompt-review gate)
  - NEW `replit-ui-v1-counterparts.md` — Replit UI handoff covering AnalystCheckDialog polish, unsaved-changes 3-button dialog, verdict rendering on Funding tab, lint warning fix, G1.5b input polish, post-v1 browser smoke
- **phases.md graduation roadmap:** G1.5c (v1) → G2-v1 (Revenue) → G6-P2 (N+1) → G6-P3 (cache + regress + live comps + persona) → G6-P4 (Tier-1 graduated). Continuous deployment cadence.
- **CC active task:** Phase A (doctrine bundle commit + push) → Phase B (v1 build S1-S5) → Phase C (S6 prompt-review gate, requires user).
- **Replit active queue:** Tier-1 items A+B+C from `replit-ui-v1-counterparts.md` (block v1 ship). Tier-2 D+E independent.

## Session: April 27, 2026 (latest) — G1.5c-b BLOCKED on architectural decision

- **CC attempted G1.5c-b S1 (orchestrator wrap) autonomously while user was AFK.** Stopped before writing code after discovering structural blocker.
- **Discovery:** `server/ai/synthesis-schema.ts:47` defines `CANONICAL_RESEARCH_FIELDS` as a `z.enum(...)` covering ~40 property-research keys. None of the 5 funding keys (`runwayBufferMonths`, `sizingOvershootPct`, `trancheGapMonths`, `revenueRampDelayMonths`, `burnFlexDownPct`) are in the enum.
- **Implication:** Option A (adapter shim wrapping `orchestrateResearch()`) — the path the original `-b.md` packet drafted — would require modifying the shared synthesis schema's enum AND the shared synthesis system prompt to teach Opus about funding-domain reasoning. Both are cross-cutting changes affecting every Specialist that uses the legacy pipeline. Not a thin wrapper.
- **Three viable paths now documented in `.claude/replit-handoffs/g1.5c-tier1-deps-b.BLOCKED.md`:**
  - **A-extended** — modify shared schema + prompt; ~2-3h; reuses well-tested infrastructure but accretes domain knowledge into the shared synthesis prompt forever.
  - **B** — per-Specialist purpose-built pipeline (3 funding-specific system prompts + new `FundingSynthesisOutputSchema` + concrete orchestrator); ~3-5h; clean but ~300 LOC new code; pattern-divergence between property-research (shared) and mgmt-co Specialists (per-Specialist).
  - **C (hybrid)** — refactor `orchestrateResearch()` to accept a `SpecialistSchema` parameter; pluggable schemas + per-Specialist prompt-blocks. ADR-009 territory. ~1 day; future Specialists graduate by writing their schema, not their pipeline.
- **CC's recommendation (in BLOCKED.md):** ship A-extended for G1, then refactor to C in a P-level packet before G2 starts. Ricardo's analyst-team.md + ADR-007 implicitly point at C as the destination.
- **No code committed.** -b packet header + parent index + phases.md G1.5c row all flag the blocker. -c remains downstream-blocked.
- **What CC did do:** authored `g1.5c-tier1-deps-b.BLOCKED.md` (210 lines documenting the discovery, three options with pros/cons, and the resume actions per choice).

## Session: April 27, 2026 (later still) — Dependabot resolved (II) + collision #6

- **Dependabot: 7 open alerts → 0.** Root cause: two lockfiles in one repo. `package.json` declared `packageManager: pnpm@10.26.1` and patched transitives via `pnpm.overrides`, but 5 GH Actions workflows ran `npm install` and maintained a parallel `package-lock.json`. Dependabot scanned both trees and reported every advisory twice.
- **Pushed `4cf5fc70` (CC, pnpm migration):**
  - 5 workflows migrated: `pnpm/action-setup@v4` step (v10.26.1) before `setup-node`; `cache: npm` → `cache: pnpm`; `npm install --ignore-scripts` → `pnpm install --frozen-lockfile --ignore-scripts`; `npm run X` → `pnpm run X` for lint/check/audit/db:push/test/verify.
  - `package-lock.json` deleted (21,971 lines).
  - `.gitignore` adds `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock` to prevent future drift.
  - All 5 gates green pre-push.
- **Dismissed via API (4 xlsx alerts):** #18, #19 (pnpm-lock.yaml), then #29, #30 (package.json after manifest re-scan). Reason: `tolerable_risk` — "no patch available upstream (SheetJS publishes only via sheetjs.com CDN); export-only usage; no untrusted XLSX parsing surface."
- **Auto-closed by Dependabot:** #1, #2 (xlsx on package-lock.json), #3 (esbuild), #4 (@tootallnate/once), #14 (uuid) — manifest no longer exists.
- **Collision #6 (Replit autocheckpoint `573fa344`, "Update company assumptions page to remove legacy company tab"):** Replit's UI refactor of removing the legacy Company tab was mid-flight when CC was pushing the pnpm migration. Replit's autocheckpoint captured an INCOMPLETE state — `index.ts` updated to remove `CompanySetupSection` + `TaxSection` exports, but consumer `CompanyAssumptionsTabsView.tsx` still imported them and the actual `.tsx` files still existed. Pre-push typecheck failed with TS2724/TS2305 errors. CC reset HEAD past the broken local-only commit (`git reset --hard 4cf5fc70`) — non-destructive to origin (commit was never pushed) and the actual refactor changes survive in `stash@{0}` (deletions + `useCompanyAnalyst.tsx`/`CompanyAssumptions.tsx` updates) + `stash@{1}` (`TabsView.tsx` import fix + `useCompanyAssumptionsForm.ts` updates).
- **For Replit on next sync:** the company-tab removal refactor is preserved across `stash@{0}` + `stash@{1}`. Pop both, verify gates, commit + push. Or re-do the refactor from scratch — the changes are small. Confirmed by `git stash show stash@{0}` + `stash show stash@{1}` covering both halves.

## Session: April 27, 2026 (later) — G1.5c-a shipped + Replit-lane-narrowing + collision #5

- **G1.5c-a (engine slice) ✅ Shipped (CC, 3 commits).** `58b03e88` (S1: re-export `FundingSpecialistDeps`), `f40e0d07` (S2: add `deps?` to `MgmtCoSpecialistConfigs.funding`), `9d7fce86` (S3: thread to `createFundingSpecialist`). All 5 gates green pre-push (TS 0, lint 0, vocab 11/11, test:summary PASS, verify:summary UNQUALIFIED). Pushed in `da90f2c8`.
- **Mid-execution discovery: original -b assumed a concrete `FundingOrchestratorAdapter` that didn't exist.** Only the interface ships in `mgmt-co-funding-orchestrator-adapter.ts:189`; the docstring at line 185 said "the concrete adapter ... is wired by Replit's route-handler slice" but no impl was ever built. CC about to file BLOCKED + hand to Replit.
- **Ricardo's binding clarification:** *"replit should only be in charge of UI coding and fixing UI and UX issues."* Reverses the broader lane Replit held in 2026-04-22 + 2026-04-26 revisions of `claude-replit-split.md`.
- **Doctrine bundle landed (`871801f2` Replit autocheckpoint, collision #5):** rule revision (2026-04-27 entry), packet rename `g1.5c-tier1-deps-b.md` → `-c.md`, new `-b.md` for orchestrator wrap (3 sub-steps, `MgmtCoFundingOrchestrator` impl), parent index updated to a→b→c, phases.md G1.5c row → 🟡 Partial. Collision content preserved; attribution muddled.
- **New CC scope going forward:** every layer of G1.5c is CC's lane (engine, server/ai, server/routes, tests, phases). Replit only does UI. The orchestrator-wrap (-b) is on CC's plate. The route slice (-c) is on CC's plate. Active execution continues post-doctrine-commit.
- **New feedback memory:** `replit_lane_ui_ux_only.md` — binding 2026-04-27 tightening. CC owns engine/server/routes/tests/schema/seeds/scripts/config/packages/doctrine. Replit owns UI components/pages/styles/UI bug fixes/E2E browser verification only.

## Session: April 27, 2026 — G1.5b shipped + G1.5c packets authored + collision #4

- **G1.5b (Funding Defaults & Assumptions cascade) ✅ Shipped (Replit's lane).** Packet A (`c8881d38`+`6d00d805`): 4 schema cols on `globalAssumptions` (`runwayBufferMonths`, `sizingOvershootPct`, `revenueRampDelayMonths`, `burnFlexDownPct`) + DEFAULT_* constants in `shared/constants-funding.ts:72-75` + model_defaults seed in `script/seed-model-defaults.ts:137-140` + Admin Steady-State UI in `client/src/components/admin/model-defaults/CompanyTab.tsx:172-209`. Packet B (`1bb965e2`): 4 Funding-tab inputs in `FundingSection.tsx:327-418` + form-hook wiring in `useCompanyAssumptionsForm.ts:461-465` (with `trancheGapMonths` derived from the two date fields — design improvement over the original 5-column spec). Follow-up `6e3f7bed` (Task #742): server-side `applyFundingDefaultsOverlay` in `server/finance/apply-funding-defaults.ts` — the load-bearing piece that makes the cascade actually three-tier (without it, NULL globalAssumptions cols fell straight through to constants and bypassed the admin's Steady-State Default).
- **G1.5c packets authored (CC's lane).** `g1.5c-tier1-deps.md` parent + `-a.md` (engine slice — widen `MgmtCoSpecialistConfigs.funding.deps`, thread to `createFundingSpecialist` at `engine/analyst/surface/mgmt-co/index.ts:203`) + `-b.md` (route slice — build `FundingSpecialistDeps` bundle in `analyst-admin.ts`, re-route Funding scope through `createMgmtCoRouter`, integration test asserting ADR-008 meta fields populated, phases.md G1+G1.5c flip). Atomic budget respected: a (3 sub-steps, 3 files), b (5 sub-steps, 3 files). Replit awaiting execution.
- **G1 row updated** in `phases.md`: G1.5a + G1.5b-pre + G1.5b all closed; only G1.5c remains. G2 (Revenue graduation) blocked-by chain intact.
- **Collision #4 (agent-collision-hygiene.md):** Replit's autocommit `b8bee136` ("Update project phases and clarify deployment configuration") swept up CC's `phases.md` G1.5b/G1.5c edit + a 1-byte `client/public/opengraph.jpg` change. Content fully preserved, attribution muddled but accurate. CC's separate `ca54f2c9` packet-trio commit landed cleanly above it. Mitigation: same as prior collisions — commit aggressively across agent boundaries. The repeat says the rule's `git add -A` warning is structural, not behavioral.
- **Session-memory resume point updated** at `g1_saga_resume_point_2026-04-26.md` (renamed-in-content to 2026-04-27) — superseded prior content so a fresh session jumping in via MEMORY.md sees current state.
- **Heads-up from Replit's push report (2026-04-27 ~01:13 UTC):** GitHub Dependabot reports 16 alerts on `main` (1 critical, 5 high, 8 moderate, 2 low), pre-existing on default branch, not introduced by the G1.5b push. https://github.com/Norfolk-Group/H-Analytics/security/dependabot. Track separately; not blocking G-saga.

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

