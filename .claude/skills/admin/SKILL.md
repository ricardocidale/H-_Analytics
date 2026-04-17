---
name: admin
description: Admin page architecture. 19-section shell pattern, extraction guide, API routes, shared types, AI Agent dashboard, Services tab, Research configuration.
---

# Admin Page — Entry Point

## Purpose
Documents the Admin Settings page architecture — 19 sections with standalone tab components + shell.

## Sub-Skills
| File | What It Covers |
|------|---------------|
| `admin-refactor-map.md` | Component structure, file map, prop interfaces, data flow |
| `tab-extraction-guide.md` | How to extract new tabs from monolithic pages |
| `admin-shell-template.md` | Shell pattern with tab navigation |
| `component-checklist.md` | Checklist for new admin components |
| `admin-api-routes.md` | Admin API endpoints |
| `database-sync-behavior.md` | DB sync and seed behavior |
| `ai-agent-admin.md` | AI Agent tab: 7-tab dashboard, components, hooks, API endpoints |

## Key Files
- `client/src/pages/Admin.tsx` — shell (tab navigation only)
- `client/src/components/admin/` — 13 tab components + barrel export + shared types
- `server/routes/admin/index.ts` — Admin router (registers all sub-routers)
- `server/routes/admin/marcela.ts` — AI Agent admin API (DB column names keep `marcela_*`)
- `server/routes/admin/research.ts` — Research config GET/PUT endpoints

## Tabs (13)
Users, Groups, Activity, Branding, Themes, Logos, Navigation, Companies, Services, Market Rates, **Research**, AI Agent, Verification, Database

## Model Defaults → Model Constants
Admin → Model Defaults hosts the **Model Constants** tab (`client/src/components/admin/model-defaults/ModelConstantsTab.tsx`) — the single edit point for externally-governed values like `depreciationYears` and `daysPerMonth`. Three-state provenance badges (factory / manual / analyst), locality cascade with "Using US baseline" fallback, mandatory note on manual override, reset-to-factory, and "Regenerate via Analyst" (grounded research → typed proposal → diff dialog → apply). All other surfaces that show a Model Constant are read-only and link back here. See ARCHITECTURE.md §2 ("The third category: Model Constants").

## Research Tab
Per-event control over AI research: enable/disable, focus areas, regions, time horizon, custom instructions, custom questions, deterministic tool selection. Config stored in `global_assumptions.researchConfig` (JSONB). See `rules/research-precision.md`.

## AI Agent Tab
The AI Agent tab manages Rebecca chatbot configuration.

See `ai-agent-admin.md` for full architecture.

## Related Rules
- `rules/api-routes.md` — API naming conventions
- `rules/ui-patterns.md` — Button labels, entity cards
- `skills/coding-conventions/context-reduction.md` — Skills required for every feature
