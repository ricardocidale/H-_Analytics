# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last twelve on every session end.

---

## Session: April 19, 2026 — Phase 3b complete + OT-A handoff active (Replit)
- **Phase 3b landed (Replit, `ee0c6573`):** Funding + Revenue Surface Specialists wrap legacy evaluators via `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null` (legacy `watchdog` field removed); `AnalystCheckDialog` consumes the verdict directly; `tests/analyst/personas/lb.test.ts` exercises real Specialists end-to-end. All five gates green.
- **Frozen contract reaffirmed:** `save_anyway` is NOT in the AnalystAction union — UI-only ghost button via `onProceedAnyway`. `adjust`→`consult-cognitive`, `ack`→`dismiss`. Persona hardcoded `{L+B, luxury, US}` (single-tenant); resolution + verdict-cache deferred to follow-ups.
- **OT-A handoff active (Claude Code, parallel):** `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md` — Anthropic prompt-caching, AI-SDK + AI Gateway wrapper, synthesis A/B, optional cutover. Touches `server/ai/` ONLY. Replit Agent must NOT touch `server/ai/{ai-sdk-clients,synthesis-schema,research-value-extractor}.ts` while OT-A is open.
- **Boundary preserved:** `.claude/claude.md` belongs to Claude Code; Replit Agent updated `replit.md` only and is appending here.

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
