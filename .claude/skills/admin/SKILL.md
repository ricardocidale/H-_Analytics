---
name: admin
description: Admin page architecture. 13-tab shell pattern, extraction guide, API routes, shared types, AI Agent dashboard, Services tab, Research configuration.
---

# Admin Page — Entry Point

## Purpose
Documents the Admin Settings page architecture — refactored from a 3,235-line monolith into 13 standalone tab components + shell.

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

## Research Tab
Per-event control over AI research: enable/disable, focus areas, regions, time horizon, custom instructions, custom questions, deterministic tool selection. Config stored in `global_assumptions.researchConfig` (JSONB). See `rules/research-precision.md`.

## AI Agent Tab
The AI Agent tab manages Rebecca chatbot configuration.

See `ai-agent-admin.md` for full architecture.

## Related Rules
- `rules/api-routes.md` — API naming conventions
- `rules/ui-patterns.md` — Button labels, entity cards
- `skills/coding-conventions/context-reduction.md` — Skills required for every feature
