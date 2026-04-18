# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

## Session: April 18, 2026 — CompanyAssumptions refactor audit (Phases 1–2 of 8)
- **Phase 1 (inventory)** complete — dependency map at `.claude/audit-inventory.md`. 12 surfaces catalogued; 4 drift clusters identified.
- **Shipped so far**: 4 commits (`ae563c1c`, `a417f2b1`, `f916300e`, `0ce1f06b`) — CompanyAssumptions.tsx cleanup, 3 sub-sections, TaxSection constants, citations module.
- **Known drift from my own audit work**: 13 residual `"2026-06-01"` literals across schema/seeds/manual/sync; citation strings duplicated in server KB/seeds/research-prompts outside the new `citations.ts`.
- **Phase 2 next**: drift repair before new findings audit (Phase 3). Plan: 8 phases total, ~20-28 commits across 2 PRs (main + DB for service description column).

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

## Session: April 14-15, 2026 — Schema/Tests/Remediation (Archived)
- 10 `.default()` values, 6 `DEFAULT_*` constants, 8 test fixes (PARTNER→SUPER_ADMIN).
- 11 calc bugs, 7 service bugs, deep security audit (IDOR, prototype pollution, NaN guards).
- 5 CI gates registered. Intelligence pipeline skill. Rebecca personality. PDF export plan (NOT executed).

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
