**From:** Replit Agent
**To:** CC (Claude Code Shell)
**Date:** 2026-05-19
**Context:** Session 28 — LLM configuration UX improvement. Builds on the existing agent/specialist roster infrastructure (`AgentRosterAccordion`, `SpecialistsRosterPage`, `AgentsRosterPage`).
**Why this is a handoff:** Replit-safe frontend work is complete. No CC-owned surfaces were touched. Handing back to CC for any follow-on backend work or next roadmap item.

---

## Scope of work

Per-entity LLM info (vendor chip + model label + recommended badge) now appears inline on each expanded agent and specialist roster card. The central LLMs menu retains all configuration controls. The redundant Specialists section has been removed from `LlmWorkflowsPage`.

Five files changed — all within `artifacts/hospitality-business-portal/src/`. No engine, calc, DB schema, migration, or server route changes.

---

## What was delivered

### 1. `artifacts/hospitality-business-portal/src/lib/agent-roster.ts`
Added `RosterLlmInfo` type and optional `llmInfo` field on `RosterEntry`:

```ts
export interface RosterLlmInfo {
  vendor: string;
  model: string;
  recommended: { vendor: string; model: string } | null;
  hasOverrides?: boolean;
}
// RosterEntry gained: llmInfo?: RosterLlmInfo
```

### 2. `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`
Two new inline components added:
- `VendorChip` — small pill showing vendor name (capitalised)
- `RosterLlmDisplay` — renders `VendorChip` + model slug label + optional "Recommended" green badge + optional "Custom" amber badge; conditionally shows "Differs from recommended" hint when configured model diverges from registry recommendation

`entry.llmInfo` is rendered in the expanded card body, between the `whereUsed` row and the minion history section. Uses `cn` (already imported).

### 3. `artifacts/hospitality-business-portal/src/pages/intelligence/SpecialistsRosterPage.tsx`
Rewritten to:
- Fetch `GET /api/admin/specialists` for `hasLlmOverrides` boolean per specialist
- Call `useLlmRegistry()` for `research-deep` function recommendation
- Build `llmInfo` per entry: `vendor` + `model` from registry recommendation; `hasOverrides` from specialists list
- Display shows recommended model as proxy (per-specialist model detail requires a separate endpoint not yet built)

### 4. `artifacts/hospitality-business-portal/src/pages/intelligence/AgentsRosterPage.tsx`
Rewritten to:
- Fetch `GET /api/global-assumptions` and parse via `mergeRebeccaSettings(globalData.rebeccaConfig)`
- Use `settings.llm.provider` + `settings.llm.model` as Rebecca's actual configured vendor/model (NOT the legacy `rebeccaChatEngine` engine slug)
- Call `useLlmRegistry()` for `chat` function recommendation
- Wire `llmInfo` onto Rebecca's entry only; all other agents pass through unchanged

### 5. `artifacts/hospitality-business-portal/src/pages/intelligence/LlmWorkflowsPage.tsx`
- Removed `SpecialistsSection` import and `{showSpecialists && <SpecialistsSection />}` render
- Removed `showSpecialists` derived flag
- Updated file docstring (§7 removal noted)
- Removed stale comment referencing SpecialistsSection

---

## What this handoff does NOT include

- No changes to `SpecialistsSection.tsx` itself — it still exists as a file but is now unreferenced. CC may delete it in a future cleanup pass if desired, but it is not blocking anything.
- No new backend endpoint for per-specialist model detail (the specialists list endpoint only returns `hasLlmOverrides`, not the actual assigned model slug). If that detail is needed in future, a new endpoint in `routes/admin/specialists.ts` would be the right place.
- No changes to `GET /api/admin/specialists` response shape.
- No changes to any CC-owned surface (engine, calc, DB, migrations, server routes).

---

## Verification

Design review gate (CLAUDE.md §11): `/post-coding-design-review` was run against the four
affected UI components before commit — `AgentRosterAccordion.tsx`, `SpecialistsRosterPage.tsx`,
`AgentsRosterPage.tsx`, `LlmWorkflowsPage.tsx`. No blocking findings.

All gates already confirmed green by Replit Agent before commit:

```bash
# Typecheck
cd artifacts/hospitality-business-portal && pnpm run typecheck
# Expected: exits 0, no TS errors

# Lint
pnpm run check:lint
# Expected: "Done" for all packages

# UI canonical (Rule A Analyst CTA + Rule B CurrentThemeTab)
pnpm --filter @workspace/scripts run check:ui-canonical
# Expected: "PASS — no Rule A (Analyst CTA) or Rule B (canonical tabs) violations"
```

Pre-existing failures (not related to this work):
- `test:api-server` — slides/builder/marco/dispatch tests; CC-owned surfaces

---

## Definition of done

This handoff is informational — no action required from CC unless follow-on work is planned. The commit is already on `main` (checkpoint `5239195c9`).

If CC picks up the SpecialistsSection.tsx cleanup or the per-specialist model detail endpoint, update `.agents/status/cc.md` as usual.
