---
name: export-config
description: Per-category export configuration system controlling which sections appear in exported reports. Use when modifying export section visibility, adding toggleable sections, or debugging missing report sections.
---

Per-category export configuration system. Controls which sections appear in exported reports (Overview, Financial Statements, Financial Analysis). Use this skill when modifying export section visibility, adding new toggleable sections, or debugging why a report section is missing.

## Architecture

| Layer | File | Purpose |
|-------|------|---------|
| Type definition | `client/src/lib/exportConfig.ts` | `ExportConfig` interface, `DEFAULT_EXPORT_CONFIG`, `loadExportConfig()`, `saveExportConfig()` |
| Server schema | `server/routes/admin/exports.ts` | Zod schemas, `GET/PUT /api/admin/export-config` endpoints |
| Admin UI | `client/src/components/admin/ExportsTab.tsx` | Three-tab settings panel |
| Consumer | `client/src/components/dashboard/exportRenderers.ts` | Reads config to gate section rendering |
| DB persistence | `global_assumptions.exportConfig` | JSONB column in `global_assumptions` table |

## Three Report Categories

| Category | Sections |
|----------|----------|
| **overview** | `kpiMetrics`, `revenueChart`, `projectionTable`, `compositionTables`, `compositionCharts`, `waterfallTable`, `propertyInsights`, `aiInsights` |
| **statements** | `incomeStatement`, `incomeChart`, `cashFlow`, `cashFlowChart`, `balanceSheet`, `balanceSheetChart`, `detailedLineItems` |
| **analysis** | `kpiSummaryCards`, `returnChart`, `freeCashFlowTable`, `propertyIrrTable`, `dcfAnalysis`, `performanceTrend` |

Each category also carries 6 format fields: `allowLandscape`, `allowPortrait`, `allowShort`, `allowExtended`, `allowPremium`, `densePagination`.

## Data Flow

```
Admin saves → PUT /api/admin/export-config
             → Zod validates → merges with defaults
             → stores in global_assumptions.exportConfig (JSONB)
             → admin UI also calls saveExportConfig() → localStorage

User exports → loadExportConfig() reads from localStorage (falls back to defaults)
             → exportRenderers check cfg.{category}.{section}
             → skips disabled sections
```

Note: `loadExportConfig()` reads from **localStorage** (not API). The Admin ExportsTab fetches from API on mount, then saves to both API and localStorage via `saveExportConfig()`.

## Adding a New Section Toggle

1. **Type** — Add boolean field to the category in `ExportConfig` (in `exportConfig.ts`)
2. **Default** — Add to `DEFAULT_EXPORT_CONFIG` (both client and server copies)
3. **Zod** — Add to the category schema in `server/routes/admin/exports.ts`
4. **Admin UI** — Add `SectionToggle` component in the matching tab in `ExportsTab.tsx`
5. **Consumer** — Gate the section render in `exportRenderers.ts` with `if (cfg.{category}.{field})`

## Key Constraints

- Client and server `DEFAULT_EXPORT_CONFIG` objects must stay in sync
- Server always merges incoming config with defaults (forward-compatible with new fields)
- Config is loaded per-export, not cached globally — ensures admin changes take effect immediately
- Section toggles only control section visibility — format/orientation/quality settings are separate
