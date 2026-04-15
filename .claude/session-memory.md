# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

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
