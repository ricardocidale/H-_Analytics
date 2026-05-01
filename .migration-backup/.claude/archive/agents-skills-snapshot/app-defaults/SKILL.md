---
name: app-defaults
description: App Defaults single-source-of-truth rule for HBG Portal. All default/seed/starting values live exclusively in Admin App Defaults. Use when adding or modifying default configuration values.
---

# App Defaults — Single Source of Truth

## Rule

**ALL default/seed/starting values live exclusively in Admin → App Defaults.** No other page, tab, or component may define or display inline default selectors.

This applies to every category of configurable starting value across the entire app:

- **Market & Macro** — inflation rate, cost of equity, fiscal calendar, days-per-month convention
- **Property Underwriting** — starting ADR, occupancy, room count, revenue shares, USALI cost rates, acquisition financing, depreciation, exit assumptions
- **LLM Defaults** — default vendor + model for each LLM functional area (Research, Operations, Assistants, Exports)
- **Any future defaults** — add them here, not inline elsewhere

## Why

1. **Single place to look.** Admins configure seed values in one screen. No hunting across tabs.
2. **Consistent cascade.** Downstream pages (LLMs, properties, projections) inherit from App Defaults. They can override, but the default always comes from one place.
3. **No drift.** Inline defaults inevitably desync from the canonical source and confuse both admins and developers.

## Architecture

### Where defaults are stored

| Category | Storage | API |
|---|---|---|
| Market & Macro, Property Underwriting | `global_assumptions` table (JSON columns) | `GET/PUT /api/global-assumptions` |
| LLM Defaults | `global_assumptions.researchConfig.tabDefaults` | `GET/PUT /api/admin/research-config` |

### Resolution order (cascade)

Every subsystem that consumes a default must follow this precedence:

```
entity-level explicit value  →  App Default  →  hardcoded system constant
```

For LLMs specifically:
```
LLM card explicit vendor/model  →  tabDefaults[tab].llmVendor/primaryLlm  →  DOMAIN_DEFAULTS in resolve-llm.ts
```

### UI location

Admin sidebar → System → **App Defaults** (internal key: `model-defaults`)

Three sub-tabs:
1. **Market & Macro** — economic environment, fiscal calendar
2. **Property Underwriting** — revenue, costs, financing, tax, exit
3. **LLM Defaults** — per-tab LLM vendor + model seeds

### Key files

- `client/src/components/admin/ModelDefaultsTab.tsx` — the App Defaults UI
- `client/src/components/admin/AdminSidebar.tsx` — sidebar entry (label: "App Defaults")
- `server/ai/resolve-llm.ts` — LLM resolution with tab default fallback
- `server/routes/admin/research.ts` — Zod schema + merge handler for `tabDefaults`
- `shared/schema/research-types.ts` — `ResearchConfig.tabDefaults` type

## Checklist for adding a new default

1. **Does this value seed/initialize something?** → It belongs in App Defaults.
2. Add the field to the appropriate sub-tab in `ModelDefaultsTab.tsx`.
3. If it's a new storage field, add it to the relevant API schema (global assumptions or research config).
4. Wire the downstream consumer to read from App Defaults as the fallback before hardcoded constants.
5. **Never** add an inline "defaults" section to another admin page.
