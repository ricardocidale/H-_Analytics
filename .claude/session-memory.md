# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

## Session: April 18, 2026 — CompanyAssumptions audit, Phases 1–5A complete
- **Claude (Phases 1–3):** inventory → drift repair → 16-file audit sweep. 4 Claude commits + D-1 closure (`8f50224a`, `5d4b4111`); 8 findings catalogued as tasks #9–#16. Split workflow formalized (`.claude/rules/claude-replit-split.md`): UI/DB → Replit, docs/refactors → Claude. Handoffs in `.claude/replit-handoffs/`.
- **Replit (Phase 4 — 8 commits + docs `806dfe87`):** `1a131949` Phase 2 vocab fix, then `5bde2ca3`, `f19800eb`, `ea395e51`, `fd05ea59`, `623f324a`, `d5555e43`, `c34fb96f`. Architect PASS. Handoff #9 deviation lesson: TS rejects extraneous props on typed components — future constant-removal handoffs must account for this. #15 surfaced a real contract bug: `PortfolioPropertySummary` was missing `isActive`.
- **Replit (Phase 5A — 2 commits + docs `c58517e9`):** `847e1f3a` promote `citations.ts` to `shared/` + rewire 9 client imports; `0c3ebc1b` adopt `CITATIONS` in `server/data/researchSeeds.ts` (3 exact-match lines). D-2 closed for exact-match sites. All verification UNQUALIFIED.
- **Phase 5C handoff drafted (Claude):** `.claude/replit-handoffs/phase-5c-capital-raise-date-drift.md` — promote `DEFAULT_CAPITAL_RAISE_{1,2}_DATE`, adopt across schema/syncHelpers/seeds/Section04 (1 commit). Awaiting Replit execution.
- **Phase 5B decision (user):** option 1 — strip baked defaults from Rebecca KB, let her query live values. Handoff to be drafted by Claude Code; Rebecca's chat route already loads `ga` so live values propagate without re-indexing beyond the KB markdown edit.

## Session: April 17, 2026 — Vocabulary Hard-Rule + Button Rename + Tab-Content Hygiene
- **"Configure Assumptions" button → "Assumptions"** in `client/src/components/company/CompanyHeader.tsx` (single occurrence).
- **Vocabulary hard-rule added** as §0 in `.claude/skills/vocabulary/SKILL.md`: **Assumptions = user-facing working variables**, **Defaults = admin-only seeds**. Different DB columns, different routes, different audiences. Word *"default"* banned from user-facing copy outside Admin. Mirrored to `replit.md` and `.claude/claude.md`.
- **Tab-content hygiene**: `SummaryFooter` was mixing overhead-escalation language with staff-tier language in one paragraph on every tab. Split into tab-aware footer — staffing summary now renders only on Compensation tab, escalation summary only on Overhead tab, no footer on other tabs. **Principle for future agents**: any text that summarizes tab state must live with that tab's concern. Staffing tiers drive compensation, not overhead — never group them by visual proximity.

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
