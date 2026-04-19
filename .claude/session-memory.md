# Session Memory

**Read this file + `claude.md` at session start. Update at session end.**
**Older sessions archived in `.claude/archive/session-memory-archive.md`.**

## Format Rule
Keep each session entry to ≤5 lines. Detail lives in skill files. Archive sessions older than the last two on every session end.

---

## Session: April 19, 2026 — Analyst architecture doc + Phase 6 paused for re-seed
- **Architecture mental model written (Claude, commit `6fc4d676`):** `.claude/notes/analyst-architecture.md` — 240-line walkthrough of the N+1 orchestrator (Gemini + Sonnet in parallel, Opus synthesis), supporting cast across ~40 files, what's elegant (model disagreement = confidence band, deterministic-math enforcement, narrative context packs), open questions (three-model cost, `research-history` namespace, single-panel fallback quality, staleness/re-run semantics). Informational only — not a handoff. New `.claude/notes/` directory introduced as the "knowledge-sharing between agents" channel (distinct from `replit-handoffs/` which is instructional).
- **Phase 6 paused:** Replit kicked off a DB + app re-seed with Analyst-vetted values. Phase 6 (add `description` column to `companyServiceTemplates`) is on hold until that lands to avoid schema/seed-row conflicts. No file edits from Claude Code in parallel.
- **5B re-index still pending user action** — one-time Admin UI click at AI Research → System Health → Re-index next to `knowledge-base` row. Expected `chunksIndexed` delta ≈ +4.

## Session: April 18, 2026 — CompanyAssumptions audit, Phases 1–5 complete (15 commits across 2 days)
- **Claude (Phases 1–3):** inventory at `.claude/audit-inventory.md` (12 surfaces, 4 drift clusters) → drift repair (D-1 closed: `8f50224a`, `5d4b4111`) → 16-file audit sweep producing 8 findings (tasks #9–#16). Split workflow formalized in `.claude/rules/claude-replit-split.md` (UI/DB → Replit, docs/refactors → Claude); handoffs in `.claude/replit-handoffs/`.
- **Replit (Phase 4 — 8 commits, architect PASS):** `1a131949` + `5bde2ca3` → `c34fb96f`. Two durable lessons: (a) handoff #9 wrongly assumed TS accepts extraneous props on typed components — correct future handoffs of that shape; (b) #15 surfaced a real contract bug — `PortfolioPropertySummary` was missing `isActive` while `PropertyFeeSummaryTable` rendered an "Excluded" badge off it.
- **Replit (Phase 5A citations — `847e1f3a`, `0c3ebc1b`, docs `c58517e9`):** promote `citations.ts` to `shared/citations.ts`, rewire 9 client imports, adopt `CITATIONS` in `server/data/researchSeeds.ts` (capRate/costIT/saleCommission). D-2 closed for exact-match sites; the short `"HVS 2024"` label deferred as a product decision.
- **Replit (Phase 5C capital-raise dates — `6a18d8cf`):** added `DEFAULT_CAPITAL_RAISE_1_DATE` / `DEFAULT_CAPITAL_RAISE_2_DATE` to `shared/constants.ts`; adopted across schema/syncHelpers/dev-seed/Section04 (8 literal substitutions, 1 commit). D-1-B closed.
- **Replit (Phase 5B KB orphan cleanup — `f2c90e04`, `5dd1a5f4`, docs `18679eb7`):** Phase 5B scope was reframed mid-handoff after Claude discovered the entire `server/ai/kb/` directory (added in `640e889f`) was orphaned — never wired into the RAG pipeline. Ported 4 high-value chunks (Founder Background, International Depreciation, Research Workflow, Governed Model Constants) into `server/ai/kb-content.ts` with vocabulary cleanup, then deleted the 19-file directory wholesale (~900 lines). All Phase 5 verification UNQUALIFIED. Re-index pending user action.

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
