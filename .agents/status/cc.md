# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-17T15:00:00Z
Status: active

## Active Branch

feat/ui-canonical-enforcement-gate

## Last Commit on Branch

2b8f89f7c (Replit) Update documentation and status to reflect recent changes and handoff

## What CC Is Doing This Session (2026-05-17 session 11)

**Executing Phase 3** of plan `docs/plans/2026-05-17-005-agent-taxonomy-registry.md`:
Rename `ORCHESTRATOR_SPECIALIST_ID` `"gaspar"` → `"gustavo"` in `lib/engine/src/analyst/identity.ts`.
Added `LEGACY_ORCHESTRATOR_ID = "gaspar"` alias (remove in Phase 4).
Updated all live string literals + JSDoc references across portal + api-server.
**All gates pass. Committed f93cd76e8.**

Replit is concurrently working on Save button work (modified files in working tree,
2 untracked files) — **not staged, not touched by CC**.

Branch: `feat/ui-canonical-enforcement-gate`.

## Files CC Owns Right Now

Branch is unmerged; surfaces in scope per plan:
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/reference-ranges/FilterBar.tsx`
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceRangesTab.tsx`
- `artifacts/hospitality-business-portal/src/components/property-finder/PropertyDetailDrawer.tsx`
- `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx`
- 11 gray-zone migration files (see plan U3)
- `scripts/src/check-ui-canonical.ts`, `scripts/src/check-gate-health.ts`
- `CLAUDE.md`, `replit.md`, `.agents/skills/ui-page-patterns/SKILL.md`,
  `.agents/skills/analyst-research-buttons/SKILL.md`

## What CC Did This Session (2026-05-16 session 9 — prior)

Resumed from prior session (T3-1 already merged as PR #158). This session:

**ce-compound documentation** (COMPLETE):
- New: `architecture-patterns/matteo-multi-vendor-llm-slot-routing-2026-05-16.md`
  — 4-layer admin-editable LLM slot routing via admin_resources; resolveLlmFor + generateText
  dispatch; feature flags; no model names in TS (CLAUDE.md §1)
- New: `security-issues/auth-before-write-portfolio-assignment-2026-05-16.md`
  — IDOR fix in PUT /api/properties/:id/portfolio; ownership check before updateProperty
  mutation; applies to both HTTP route + Rebecca tool implementations
- New: `best-practices/coderabbit-false-positive-engine-null-fallbacks-2026-05-16.md`
  — three-layer resolver guarantees non-null; ?? 0 fallbacks are Category 2 taxonomy violations;
  reply template for CodeRabbit false positives on engine fields
- Updated: `workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`
  — added reset+force-with-lease sub-pattern for all-worthless-Replit-commits case

**Replit handoff push:**
- Pushed 4 Replit commits (tab standardization, sidebar restructure, flex-label-overflow fixes,
  handoff doc) from local main to origin/main per Replit's handoff request

## What's Pending

Nothing from CC for this session.

## Handoff to Replit

All clean on main. No CC-specific work outstanding.

Outstanding Replit UI tasks (still on Replit's plate, unchanged from prior handoff):
- T2-4 UI: "Verify deck" button in Slide Factory Tab 6
  POST /api/slide-factory-runs/:id/verify → GET /api/slide-factory-runs/:id/verification
  Severity: ok=emerald, advisory=sky, warning=amber, block=red
- T2-3 UI: "Improve with AI" button on descriptionImproved textarea in BasicInfoSection.tsx
  POST /api/properties/:id/rewrite-description { text: string }
- T2-2 UI: Portfolio selector on property list
  GET /api/portfolios, PUT /api/properties/:id/portfolio { portfolioId: N | null }

Pre-existing test failures (not introduced this session, not CC-owned):
- check:lint → no-shadow in api-server/src/chat/rebecca-tool-impls-slide-factory.ts
- test:api-server → marco, builder-substitution-map, pptx-substitution, dispatch, slide-6-embed-flow

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)

### Owner-maintained CC skills — DO NOT DELETE OR MODIFY

These four skill files are maintained by the repo owner and have been
restored multiple times after CC sessions wiped them. Treat as read-only.
Do not remove, overwrite, or merge-conflict-resolve them away.

- `.agents/skills/start-here/SKILL.md`
- `.agents/skills/plugin-stack/SKILL.md`
- `.agents/skills/workflows/SKILL.md`
- `.agents/skills/run-workflow/SKILL.md`
