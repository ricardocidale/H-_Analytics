# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T21:45:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

11f3cd1c6  chore(merge): resolve conflicts after PR #158 merge + fix readonly tab arrays

## What CC Did This Session (2026-05-16 session 8)

T3-1 Matteo model router (COMPLETE — merged PR #158):
- U1: Seed DeepSeek V4/Flash, Mistral Large/Small model rows; new llm_slot rows
  (pdf-ocr-extraction, structured-extraction, bulk-text-synthesis, costantino-orchestration);
  feature-flag parameter rows (all default 0/off)
- U2: DeepSeek + Mistral SDK client factories in ai/clients.ts (lazy singletons,
  env-var base URL override, Mistral OCR HTTP wrapper with model from admin_resources)
- U3: dispatch.ts DeepSeek + Mistral provider branches + uniform logApiCost wrap
- U4: chat-llm.ts streaming branches for DeepSeek + Mistral
- U5: Remove hardcoded VISION_MODEL constant; route through resolveLlmFor + generateText
- U6: GET /api/admin/llm-cost-summary endpoint + Rebecca download_llm_cost_summary tool;
  computeLlmCostSummary() shared export; parity map updated
- U7: LLM Workflows page — DeepSeek/Mistral vendor dropdowns, new slot groups,
  per-slot 30-day cost badges (COST_WINDOW_DAYS constant)
- U8: callLlmForText in executive-summary refactored to use dispatch.generateText;
  matteo-enable-bulk-text-synthesis flag routes to bulk-text-synthesis slot when nonzero
- CodeRabbit fixes: console.info→logger.info, getMistralOcrConfig() model from admin_resources,
  RESEARCH_LLM_VENDORS updated, dispatchService doc corrected, package.json ordering,
  portfolioId runtime validation, auth-before-write security fix (both route + Rebecca tool)
- Branch hygiene: stripped 4 Replit commits, recommitted auth fix as CC, force-pushed clean
- Merge conflict resolution: took PR state for migrations.ts, portfolios.ts,
  rebecca-tool-impls-portfolio.ts, parity-map; fixed Replit's `as const` readonly errors
  in PipelineConfigTab.tsx + ResourcesAdminPage.tsx

## What's Pending

Nothing from CC for this session. Replit owns the remaining UI tasks.

## Handoff to Replit

All T3-1 backend work is on main. Feature flags (matteo-enable-* parameters) are seeded
with value=0 (off by default) — flip to 1 via admin_resources to enable routing.

Remaining Replit UI tasks from prior sessions (still outstanding):
- T2-4 UI: "Verify deck" button in Slide Factory Tab 6
  POST /api/slide-factory-runs/:id/verify → GET /api/slide-factory-runs/:id/verification
  Severity: ok=emerald, advisory=sky, warning=amber, block=red
- T2-3 UI: "Improve with AI" button on descriptionImproved textarea in BasicInfoSection.tsx
  POST /api/properties/:id/rewrite-description { text: string }
- T2-2 UI: Portfolio selector on property list
  GET /api/portfolios, PUT /api/properties/:id/portfolio { portfolioId: N | null }

## Files CC Owns Right Now

None — all committed.

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
