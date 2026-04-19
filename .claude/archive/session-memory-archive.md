# Session Memory Archive

Older sessions moved here to reduce token cost. Only referenced when investigating historical decisions.

Rule change April 19, 2026: "last two" → "last twelve" sessions retained in `session-memory.md`. Entries April 18 through March 9, 2026 were pulled back into the main file at that time.

April 20, 2026: 8 sessions re-archived to restore 12-session cap after the OT-A arc generated 8 new entries. Sessions April 14 through March 9 moved here.

---

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

## Session: April 19, 2026 — OT-A.3 structural wiring (commit f1cd4aee)
- Synthesis branch behind USE_AI_SDK_SYNTHESIS env flag (default OFF).
- Schema landed earlier in 595bd061; wiring uses streamObject + AI SDK v6 providerOptions for ephemeral cache_control.
- Five gates GREEN. A/B parity run on 20 inputs is **PENDING USER AUTHORIZATION** — autonomous Opus spend (~\$12-40) was held back. Go/no-go for OT-A.4 deferred until A/B documented.

## Session: April 19, 2026 (cont.) — OT-A.3 A/B parity run (commit 12363142) — DOES NOT PASS
- 11/20 cases captured before Vercel AI Gateway hit insufficient_funds (HTTP 402); top-up required.
- Two clear FAILs even on partial sample: latency regression +190% (vs ≤20% target) + field-name divergence (7/11 cases produce zero shared keys because SynthesisOutputSchema.field is an unrestricted z.string()).
- OT-A.4 BLOCKED. Required remediation: (a) tighten schema to `field: z.enum([...KNOWN_KEYS])`, (b) add field-key contract to system prompt, (c) consider trimming reasoning.max + dropping narrative[] to fix latency, (d) Gateway top-up.
- Structural OT-A.3 commit (f1cd4aee) safe in place; flag default OFF; no production behaviour change.

---

## Session: March 8, 2026 — Context Unburden + Admin Research + Codebase Architecture
- Slimmed rules from ~4,203→~850 lines (-80%); moved 4 reference docs to skills/
- New Admin "Research" tab (13th); config in `global_assumptions.researchConfig` (JSONB)
- Documented 80+ UI components, ElevenLabs architecture (35 files)

---

## Session: February 14, 2026

### Per-Property Financing Architecture Migration
- Moved Acquisition Financing, Refinancing, Disposition Commission from systemwide to per-property
- Schema: Added 10 per-property columns (dispositionCommission, refinance*, acquisition*)
- Fallback: Changed from `property → global → DEFAULT` to `property → DEFAULT`
- Updated: financialEngine, loanCalculations, equityCalculations, cashFlowAggregator, calculationChecker, seed, routes, syncHelpers
- Settings.tsx: Financing sections relabeled "Defaults for New Properties"
- Tests: 1372 passing, UNQUALIFIED

### F&B Cost Fix + Operating Reserve Seed
- F&B expense: Changed from `revenueRooms * costRateFB` to `revenueFB * costRateFB` (USALI standard)
- Operating reserve seeds cumulative cash at acquisition month (covers pre-ops debt service)
- Blue Ridge Manor reserve: $300K → $500K; Casa Medellín: $250K → $600K
- Tests: 1371 passing, UNQUALIFIED

### Verification UI — Accordion Category Grouping
- Added `renderGroupedChecks()` in Admin.tsx — groups checks by category
- Categories with all passes collapse by default; failures auto-expand

### Auditor Fixes
- Fixed loan amortization audit to use per-property financing fields
- Fixed cash flow reconciliation to include operatingReserve
- Fixed `convertToAuditInput` to pass per-property fields

### Operating Reserve Tests (10 tests)
- File: `tests/engine/operating-reserve-cash.test.ts`
- Tests: 1381 passing, UNQUALIFIED

### Refinance Operating Reserve Bug Fix
- Bug: Refinance Pass 2 reset `cumCash = 0`, losing operating reserve from Pass 1
- Fix: Added reserve seed at `acqMonthIdx` during refinance loop
- 3 regression tests added. Tests: 1384 passing

---

## Session: February 13, 2026 — Dashboard Hover Effects

### KPIGrid + Dashboard Hover Effects
- KPIGrid: framer-motion whileHover (scale 1.04, y -4), radial gradient overlay, enhanced shadow
- Dashboard cards: 9 cards with themed glow effects (blue/amber/emerald/sage)
- Pattern: `group` class + `transition-all duration-500` + color-matched shadows + radial overlay
- SVG gauges: `group-hover:scale-110`, `group-hover:stroke-[8]`
- 6 UI skill files created under `.claude/skills/ui/` for hover patterns

---

## Session: February 13, 2026 — Consolidated Formula Helpers

### Zero Re-Aggregation Architecture
- Created `client/src/lib/consolidatedFormulaHelpers.tsx` — 7 helper functions
- Created `client/src/components/financial-table-rows.tsx` — shared FormulaDetailRow, PropertyBreakdownRow
- 3-level accordion: consolidated total → formula → per-property breakdown
- All helpers accept precomputed arrays (zero re-aggregation in render paths)
- Rules created: `docs-after-edits.md`, `read-session-memory-first.md`

---

## Session: February 13, 2026 — Logo Management, AI Image Gen, Reusable Components

### Logo Management → Admin Page Tab
- Moved from separate sidebar link to "Logos" tab in Admin
- Logo CRUD with upload (object storage), AI generate (Nano Banana), URL input

### Image Generation — Nano Banana
- Primary: `gemini-2.5-flash-image` via generateContent API
- Fallback: OpenAI `gpt-image-1`
- File: `server/replit_integrations/image/client.ts`

### Reusable Components Created
- `AIImagePicker` — upload + AI generate + URL (3 modes)
- `AnimatedLogo` — SVG wrapper for vector-like scaling/animation
- `StatusBadge`, `ImagePreviewCard`

### Other Changes
- All "Update" → "Save" buttons, added ? tooltips to all Dashboard financial lines
- README.md rewritten, full docs harmonization (84 skill files)
- Removed Catering Revenue Model card, renamed "Help & Manuals" to "Help"

---

## Session: March 7, 2026 — Multiple Sessions (Export Parity, Skill Files, ElevenLabs UI, Refactors, Docs)
- Export parity: Added ExportMenu (6 formats) to SensitivityAnalysis, ExecutiveSummary, ComparisonView
- Large page extraction: FinancingAnalysis (~720→90 lines), Scenarios (~719→350), SensitivityAnalysis (~712→200); skill files created for all 3
- ElevenLabs UI blocks installed + adapted (Next.js→Vite): VoiceChatOrb, VoiceChatFull, VoiceChatBar, Speaker, RealtimeTranscriber; VoiceLab page added at `/voice`
- AI Agent feature module reorganized: 17 EL components moved to `features/ai-agent/components/`; backward-compat barrels in `components/ui/`; `query-keys.ts` with `AI_AGENT_KEYS`
- Docs + architecture: `statements/` dir, `server/ai/`, `server/data/` reorganization; JSDoc on 9 critical files
- 7 voice UI correctness fixes + 6 code quality fixes; `claude-is-sole-truth.md` rule + 7 proof tests; doc harmonization

## Session: March 6, 2026 — Centralized Services, AI Agent Admin Tab, Hardening, Research Tools
- Centralized Services Model: `calc/services/`, `serviceTemplates` schema, ServicesTab admin UI, Company P&L Cost of Services row; 63 tests
- AI Agent admin tab (7 sub-tabs): PromptEditor, ToolsStatus, enhanced KnowledgeBase with file upload; `aiAgentName` DB column
- Codebase hardening: 27 storage layer tests, 10 E2E scenario tests, 31 recalc enforcement checks, `sendError()`/`logAndSendError()` helpers
- Research tools: 5 deterministic tools (`calc/research/`), post-LLM validation layer (`validate-research.ts`), slimmed TOOL_PROMPTS

## Session: February 24–26, 2026 — Admin Refactor, Marcela Multi-Channel, Source-of-Truth Harmonization
- Admin.tsx refactored: 3,235-line monolith → 10 tab components + 87-line shell; `script/seed-production.sql` added
- Marcela AI multi-channel: RAG KB (`server/ai/knowledge-base.ts`), Twilio Voice WebSocket, Twilio SMS, telephony admin tab
- Source-of-truth harmonization: `claude.md` stats fixed, 4 SKILL.md entry points created, `replit.md` rewritten as slim pointer

## Session: February 16, 2026 — Token Optimization, Mobile Responsive, Test Coverage
- Rule consolidation: 25 rules → 18 by merging related rules; session memory compressed
- Mobile responsive skills created: 4 files in `.claude/skills/mobile-responsive/`
- Added 101 tests (1401→1502); fixed projectionYears≥2 bug; underfunding changed to info severity

---

## Session: February 14, 2026 — Industry Research & Marcela AI

### Industry Research Tab (Settings Page)
- 4th tab: Focus Areas (10 options), Target Regions (6), Time Horizon, Custom Questions
- Model Context Card: read-only display of systemwide settings
- Backend merges user selections with globalAssumptions for AI prompts

### Marcela AI Chatbot
- Renamed from "AI Assistant" to "Marcela" — witty hospitality strategist
- System prompt: full platform knowledge, personality traits, manual chapter summaries
- Dynamic context: live portfolio data, properties, team (safe fields only — no passwordHash)
- Security: destructures only safe fields from user records

### Timezone-Dependent Date Parsing Bug (February 15)
- Root cause: `new Date("2027-07-01")` in Western Hemisphere produces previous day local time
- Fix: `parseLocalDate()` appends `T00:00:00` — forces local-time interpretation
- Applied to: financialEngine, financialAuditor, equityCalculations, loanCalculations
- 17 regression tests added. Tests: 1401 passing, UNQUALIFIED

### Research Questions CRUD (February 15)
- Database: `researchQuestions` table (id, question, sortOrder, createdAt)
- Storage: 4 IStorage methods, 4 API endpoints under `/api/research-questions`
- UI: Settings > Industry Research tab — inline editing with CRUD
- AI: Custom questions merged into research prompts
