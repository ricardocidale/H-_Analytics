# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T18:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

0987d6968  feat(T2-3): Rebecca content-gen tools — generate_executive_summary + rewrite_property_description

## What CC Did This Session (2026-05-16 session 5)

T2-3 (Analyst button audit + content tools — phase 1 COMPLETE):
- Audit: explored entire frontend for Analyst buttons vs uncovered text fields
  Section A: 20+ Analyst button sites documented
  Section B: 14 text fields without buttons identified
- Two pure parity gaps closed (routes existed, no Rebecca tools):
  * generate_executive_summary — calls generatePropertyExecutiveSummary directly,
    invalidates route-level cache, returns structured + formatted text
  * rewrite_property_description — runs aiUtilityLlm copywriter prompt,
    returns rewritten text (caller uses patch_property to persist)
- Named constants: MAX_REWRITE_DESCRIPTION_CHARS=5000, REWRITE_DESCRIPTION_MAX_TOKENS=1024
  added to lib/shared/src/constants.ts
- Parity map: "Content Generation Actions" section (3 rows) added
- typecheck PASS + magic-numbers PASS + engine tests 41/41 PASS
- Committed 0987d6968

## What's Pending

T2-3 UI (Replit-safe):
- descriptionImproved field: add "Improve with AI" or Analyst button (same pattern as
  AsPurchasedDescriptionField.tsx but for the improved description textarea)
- File: artifacts/hospitality-business-portal/src/components/property-edit/BasicInfoSection.tsx
  around line 572 (descriptionImproved textarea)
- Endpoint to call: POST /api/properties/:id/rewrite-description { text: "..." }

T2-2 UI (Replit-safe):
- Portfolio selector on property list page
- PUT /api/properties/:id/portfolio { portfolioId: N | null }

T1-5 item 2 (low priority — advisory, Replit-safe):
- analyst-admin-runners-mgmt.ts lines 140-143: `as unknown as` double-casts

## Handoff to Replit

T2-3: Add "Improve with AI" button to descriptionImproved textarea in BasicInfoSection.tsx.
Pattern to follow: AsPurchasedDescriptionField.tsx (preview-then-accept flow).
Endpoint: POST /api/properties/:id/rewrite-description (body: { text: string }).

T2-2: Add portfolio selector to property list. Endpoint: GET /api/portfolios for list,
PUT /api/properties/:id/portfolio to assign.

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
