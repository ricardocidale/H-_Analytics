# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

## Session: April 15, 2026 — Brand Voice, Personas, Shared Utilities, KB Seeds
- **Brand voice guidelines** rewritten as single source of truth (`.claude/brand-voice-guidelines.md`). 9 sections: We Are/We Are Not, corporate voice, product voices, tone matrix (10 contexts), conversation principles (7 with examples), vocabulary, visual identity, 10 before/after examples, quality checklist.
- **The Analyst + Rebecca** personas defined. 3 enforcement rules. Vocabulary audit expanded to 8 forbidden terms. Zero violations across codebase.
- **Communication skills** created (reusable, app-agnostic): `conversation-principles.md`, `ai-agent-voice.md`, `norfolk-brand-voice.md`. New domain: communication/.
- **Shared utilities** extracted: `fetchWithTimeout` + `sanitizeError` in `server/lib/`.
- **PMT copies eliminated** — 4 hand-rolled formulas replaced with `calc/shared/pmt.ts` imports.
- **18 Pinecone KB seeds** created: conversation principles, communication techniques, Norfolk AI identity, behavioral economics UX. Wired into seed runner. Replit needs to run.
- **dataQuality JSONB** added to assumption_guidance. `computeDataQuality()` 4-factor scoring.
- **Replit delivered:** user_page_visits table, AgentPersonasTab, animations placed, usePageVisit hook, FirstVisitBanner, all gates green.
- **Brand discovery:** scanned Norfolk AI Dropbox (brand guides, design systems), norfolk.ai website, proposal repo, Qurrent AI. Influences absorbed (behavioral economics, radical attention, overcoming indecision).

## Session: April 15, 2026 — MD Audit & Optimization + Schema/Test Fixes
**MD audit (DONE):** Rewrote `replit.md` and `claude.md` — updated product name to "H+ Analytics by Norfolk AI", company to "Norfolk AI". Fixed stale counts (4,816 tests/202 files/1,113 sources/190K lines). Added `super_admin` role to all role tables. Added validation gates section, domain boundary rules, drizzle-zod `.pick()` rule, design colors, git commit pattern. Compressed Recent Changes to 3 compact entries. Removed "Hospitality Business Group" branding everywhere.
**Schema fixes (DONE):** 10 `.default()` values on notNull columns in `shared/schema/config.ts`, 6 `DEFAULT_*` constants, fiscalYearStartMonth Zod validation.
**Test fixes (DONE):** 8 pre-existing failures fixed (PARTNER→SUPER_ADMIN, benchmark-lookups mock). All 4,816 tests pass.
**Validation gates (DONE):** 5 gates registered (typecheck/lint/test/verify/parity). All pass (~29s total).
**Key scratchpad:** `UserRole.PARTNER` removed. Use `SUPER_ADMIN`. drizzle-zod: `.pick()` only, never `.omit()`. `DEV_SKIP_AUTH=true`. Git: `--no-verify`.

## Session: April 14-15, 2026 — Master Remediation + Data Tables + Intelligence Architecture
**Remediation (DONE):** 11 calc bugs, 7 external service bugs, schema cleanup, 3 audit guard tests (79 tests), CI fixed, vocabulary skill + 14 UI files + user manual + Rebecca KB.
**Data Tables (DONE):** benchmark-lookups.ts (7 lookups + validateAssumptionRange), Smart Data Router Priority 0, Pinecone indexing (4 functions), prompt injection (benchmark-injector.ts). Seed file exists.
**Intelligence Pipeline Skill:** `.claude/skills/research/intelligence-pipeline.md` — 260-line definitive reference.
**Rebecca:** Personality (outgoing/intellectual/geeky/witty), full Ricardo Cidale bio, Norfolk AI identity, "built with Claude Code".
**Plans:** `master-remediation-plan.md`, `pdf-export-plan.md`, `deterministic-data-tables-plan.md`. PDF export plan NOT executed — next session.

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
