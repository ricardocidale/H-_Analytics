# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

## Session: April 13, 2026 — Codebase Reorganization & Documentation Overhaul
- Archived `.agents/skills/` (55 Replit-specific skills → `.claude/archive/agents-skills-snapshot/`). Deleted `.claude/tools/marcela/` (20 dead ElevenLabs schemas). Moved stale plans to archive.
- Merged 28 satellite skill directories into 17 consolidated domains (45→17 dirs, 170→169 files). Scrubbed Marcela/ElevenLabs/Twilio/Replit refs across 22 files.
- Created: Master Plan V2 (Phases 8-13), `docs/architecture/system-overview.md`, `docs/developer/setup.md`, `docs/developer/migration-from-replit.md`, `docs/README.md`, `.claude/skills/_index.md` (master catalog).
- Rewrote `README.md` (de-Replitified, updated revenue model, standalone infrastructure). Rewrote `claude.md` (removed Replit, updated skill paths, added core differentiators).
- Replit→standalone migration documented: PostgreSQL (trivial), Auth (medium), Object Storage (medium), AI keys (easy), Domains (easy).
- Phase 8.1 DONE: Created `server/providers/` (storage + auth + config). Rewired 12 consumer files. Zero direct Replit imports in business logic. App runs unchanged on Replit. To move: set `STORAGE_PROVIDER=s3`, `AUTH_PROVIDER=local`, fill S3 stub, deploy. Full checklist in `docs/developer/migration-from-replit.md`.

## Session: April 10, 2026 — Repo Optimization & Photo Migration
- Git gc: .git 701MB→267MB. Removed 26 unused npm deps (121→105). Installed 6 targeted d3 sub-packages replacing monolithic `d3`.
- Removed 7 tracked junk/artifact files (COST-MONITOR docs, memory.md, skills-lock.json, broken command file). Updated .gitignore.
- Migrated last 3 static Loch Sheldrake photos to Neon DB. All 28 property photos now database-backed, zero static refs. Removed 37 orphaned PNGs (65MB) from git.
- Added download buttons to PhotoCard: original photo + AI-enhanced version (when available). Replit added `Download` to themed-icons for consistency.
- Fixed 31 pre-existing TS errors (`colCount` prop on `FormulaDetailStringRow`). Replit later removed the prop from callers instead.

## Session: April 10, 2026 — Technical Debt Cleanup Sprint
- Task 1: Replaced hardcoded hex colors in StarRatingInput + RebeccaAnalyticsTab with CSS tokens and named brand constants (HP_NAVY/HP_TEAL/HP_GOLD).
- Task 2: Fixed domain boundary violations — refactored `server/notifications/engine.ts` (4 db calls) and `server/integrations/geospatial.ts` (2 db calls) to use IStorage facade. Added `getActiveAlertRulesForProperty()` to NotificationStorage. Fixed lint-staged tsc command (`bash -c` wrapper for `-p tsconfig.json`).
- Task 3: Replit split 4 of 5 large files (sidebar 771→33, Scenarios 736→74, icp-config 689→113, properties 691→265, constants 764→293). Fixed hardcoded-detection proof test to follow `export *` re-exports.
- Task 4: Removed 87 unnecessary `as any` casts from Excel exports (xlsx has types). Count 207→120. 
- All gates pass: 4,463 tests / 183 files, 0 TS errors, 0 lint errors, UNQUALIFIED verification, Doc Harmony PASS.

## Session: April 10, 2026 — Export Test Refactoring
- Created `tests/exports/helpers/index.ts` with 4 shared factories: `makeBrowserDownloadMocks`, `makeYearlyData`, `makeYearlyFinancials`, `makeTableRows`.
- Merged `pptx-export.test.ts` + `pptx-footer.test.ts` → `pptx.test.ts`; moved `tests/client/export-helpers.test.ts` → `tests/exports/excel-helpers.test.ts`.
- Eliminated duplicate coverage: inline Zod schema in premium-export, formatShort/BRAND in png-export, Excel helpers group in excel-export, pptxFontSize/pptxColumnWidths in pptx-footer.
- Standardized all describe/it naming across 8 files (no dot-notation, present-tense it blocks). 4,437 tests / 182 files, all passing.

## Session: March 23, 2026 — Export Polish, KPI Removal, LLM Recommendations, Skills Update
- Removed KPI cover pages permanently from report compiler — no KPI sections in ANY PDF export, ever.
- Chart screenshots fully wired: `captureOverviewCharts.ts` → `dom-to-image-more` → base64 PNG → server `ImageSection` via `@react-pdf/renderer`.
- CSS cleanup sheet injected during DOM capture (transparent borders, no shadows). CORS warning for Google Fonts is benign.
- Admin LLM recommendations: per-domain differentiated (Gemini 2.5 Pro, Claude Sonnet 4.5, GPT-4.1 Mini, Claude Sonnet 4). Star icon hints.
- Updated claude.md, replit.md, 3 export skills (SKILL.md, premium-export-spec.md, pdf-rendering.md), session-memory.md. Stats: 960 files, ~160K lines, 3,499 tests/155 files.

## Session: March 20, 2026 — Codebase-Wide Audit (Magic Numbers, Bugs, Export Parity)
- Fixed DSCR NOI→ANOI bug in YearlyIncomeStatement, hardcoded 0.09/0.10→constants in statementBuilders, Zod acreage mismatch (5→10)
- Added MONTHS_PER_YEAR (12), DEFAULT_STABILIZATION_MONTHS (36) to shared/constants. Moved 8 company cost constants from client→shared.
- Replaced `/ 12` with MONTHS_PER_YEAR across 20+ files (financial engines + 9 calc/ tools). Fixed prepayment.ts double-division bug (loanRate/144→loanRate/12).
- Fixed Excel property BS using NOI instead of ANOI. Memoized CashFlowTab years array + OverviewTab IRR/revenue data. Created screen-export-parity skill.
- 3,425 tests pass across 150 files. Also found 68 hardcoded colors across 11 files (not yet fixed).

## Session: March 16, 2026 — Governance Harmonization (Task #153)
- `.claude/` established as single source of truth. Created 7 new `.claude/skills/` files: business-model, product-vision, integrations, design-export, settings, ui/consistent-card-widths, ui/save-button-placement.
- All 13 `.agents/skills/` SKILL.md files converted to slim pointers with frontmatter + summary + canonical reference line.
- `claude.md` stats updated: 790 source files, ~144K lines, 186 skill files, 3,029 tests across 136 test files. Skill Router expanded with 7 new rows.
- `.replit` source-of-truth comment skipped (platform restriction prevents editing .replit directly).

## Session: March 15, 2026 — Skills Hygiene Plan Execution
- Created 7 new skills: funding-strategy, market-intelligence (+ adding-integrations sub-skill), finance/diagnostic-decision-tree, icp-research, rebecca-chatbot, document-intelligence, map-view, notifications
- Updated proof-system (4-phase → 7-phase), context-loading (routing + counts), claude.md Skill Router (7 new rows)
- Final: 176 skill files across 33 directories. Finance now 22 sub-skills.

## Session: March 15, 2026 — Documentation Update (Task #135)
- Updated `claude.md` with current project state: ~795 source files, ~144K lines, 3,022 tests across 135 test files
- Skill router updated: UI (43), Finance (22), Research (23), Testing (8), 176 total skill files across 33 directories
- Recent Changes section replaced with March 15 entries covering ~60 merged tasks since March 12
- 6 new migrations added to migration list, Key Rules updated with Resend, ICP split, LLM dual-model, Norfolk AI

## Sessions: March 13–15, 2026 — Major Feature & Polish Sprint (~60 tasks merged)
- Fee category restructure (#108–#109), funding interest accrual (#116), login redesign + Google Sign-In (#63, #131)
- ICP split into Profile + Research Center (#71), LLM dual-model architecture (#101), DocuSign/Slack removal (#133, #134)
- Resend email replacement (#68), Excel 4-sheet standardization (#112), PDF export fixes (#117, #119)
- Management Company rename (#120), company defaults (#118, #123, #124), sidebar cleanup (#130, #132)
- Admin hardening phases 1–2C (March 13), UI polish: card widths, save buttons, tabs, tooltips (#45–#49, #107)
- Norfolk AI theme (#84), DB integrity hardening (#80), deterministic calc optimization (#64)
- 3,022 tests (135 files). 0 TS errors. UNQUALIFIED.

---

## Persistent Decisions & Preferences

- **projectionYears ≥ 2** for revenue growth direction verification
- **Underfunding = info severity** (not material) — business condition, not calculation error
- **DB sync = SQL only**, never code endpoints
- **Seeding errors are ultra-serious** — cascade into calculation failures
- **"Save" not "Update"** on all buttons
- **Nano Banana** (`gemini-2.5-flash-image`) primary image gen, OpenAI fallback
- **Every page graphics-rich** — charts, animations, visual elements
- **Every financial line** gets ? tooltip
- **Reusable UI tools** created for all new features
- **Logos vector-based/SVG** with AnimatedLogo wrapper
- **3-level accordion** for consolidated statements (total → formula → per-property)
- **Zero re-aggregation** in render paths — helpers accept precomputed arrays
- **`parseLocalDate()`** for all client-side date string parsing
- **`captureChartAsImage`** exported from `@/lib/exports/pngExport`; `downloadCSV(content, filename)` takes 2 args
- **`ExportMenu` variant**: `"glass" | "light" | undefined` only
- **`admin/marcela/` DB columns** keep `marcela_*` names; only UI labels use dynamic `aiAgentName`
- **Next.js → Vite**: remove `"use client"`, replace server actions with Express endpoints, `<style jsx>` → `<style>`
- **Company unprofitable with 1 small property** — correct behavior, not a bug (partner comp $45K > fee rev ~$19K)
- **Golden scenario design**: 0% growth/inflation for traceability, hand-values at file top, test both values + identities
