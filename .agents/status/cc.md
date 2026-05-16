# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T20:15:00Z
Status: active

## Active Branch

main

## Last Commit on Branch

295b07e85  feat(finance): T2-1 investor perspective — strip mgmt co P&L from compute + block company route

## What CC Did This Session (2026-05-16 session 7)

T2-4 (vision-based export quality verification — COMPLETE):
- Bianca specialist, schema, routes, Rebecca tool, parity map all shipped
- Committed 4dcd2a9cb (20 files, 638 insertions)

T2-1 (investor perspective separation — COMPLETE):
- perspectiveRole ('operator'|'investor') column on scenarios table
  Drizzle migration 0067 + api-server mirror 0074 + runtime guard scenario-perspective-role-001.ts
- /api/finance/compute: strips companyMonthly/companyYearly when perspectiveRole='investor'
- /api/finance/company: returns 403 FIN-011 for investor perspective
- Rebecca update_scenario tool: perspectiveRole exposed as enum field
- createScenarioSchema accepts perspectiveRole in POST /api/scenarios
- SCENARIO_PERSPECTIVE_ROLES type guard + updateScenarioSchema updated
- Parity map: 2 rows added (perspective toggle)
- typecheck PASS + magic-numbers PASS
- Committed 295b07e85 (14 files, 94 insertions)

## What's Pending

T2-4 UI (Replit-safe):
- Add "Verify deck" button to Tab 6 of the Slide Factory admin panel
- Calls POST /api/slide-factory-runs/:id/verify
- Shows per-slide findings in a collapsible panel (severity color: ok=emerald, advisory=sky,
  warning=amber, block=red)
- Status polling: GET /api/slide-factory-runs/:id/verification

T2-3 UI (Replit-safe):
- descriptionImproved field: add "Improve with AI" or Analyst button
- File: artifacts/hospitality-business-portal/src/components/property-edit/BasicInfoSection.tsx
  around line 572 (descriptionImproved textarea)
- Endpoint: POST /api/properties/:id/rewrite-description { text: "..." }

T2-2 UI (Replit-safe):
- Portfolio selector on property list page
- PUT /api/properties/:id/portfolio { portfolioId: N | null }

T1-5 item 2 (low priority — advisory, Replit-safe):
- analyst-admin-runners-mgmt.ts lines 140-143: `as unknown as` double-casts

## Handoff to Replit

T2-4 UI: Add "Verify deck" button to the Slide Factory Tab 6 override panel.
Backend: POST /api/slide-factory-runs/:id/verify (synchronous, ~15-30s, returns BiancaVerificationResult).
GET /api/slide-factory-runs/:id/verification for polling/reading last result.
Severity display: ok=emerald, advisory=sky, warning=amber, block=red (per AnalystCheckDialog pattern).

T2-3 UI: Add "Improve with AI" button to descriptionImproved textarea in BasicInfoSection.tsx.
Pattern: AsPurchasedDescriptionField.tsx (preview-then-accept flow).
Endpoint: POST /api/properties/:id/rewrite-description (body: { text: string }).

T2-2 UI: Portfolio selector on property list. GET /api/portfolios for list,
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
