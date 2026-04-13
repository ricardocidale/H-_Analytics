---
name: codebase-architecture
description: Client-side codebase organization, barrel files, re-export wrappers, helper functions, utility scripts, and module boundaries. Use when restructuring code, adding new modules, or auditing imports.
---

# Codebase Architecture

## Client Folder Structure

```
client/src/
├── components/          # Shared app-level components
│   ├── ui/              # shadcn/ui primitives (Button, Card, Input, Dialog, etc.)
│   ├── admin/           # Admin panel tabs and sub-components
│   ├── dashboard/       # Dashboard tabs (KPIs, charts, export)
│   ├── financial-table/ # Financial statement table components
│   ├── graphics/        # Visual components (motion, cards, 3D)
│   ├── property-detail/ # Property detail sub-views
│   ├── property-edit/   # Property edit form sections
│   ├── property-research/ # Research display components
│   ├── property-finder/ # Property search/finder UI
│   ├── statements/      # Financial statement components
│   ├── settings/        # User settings tabs
│   └── *.tsx            # Top-level shared components (Layout, Breadcrumbs, etc.)
├── features/            # Self-contained feature modules
│   └── design-themes/   # Theme management (ThemeManager, ThemePreview)
├── hooks/               # Shared React hooks
├── lib/                 # Utilities, API clients, engine
│   ├── api/             # API client modules (properties, admin, research, etc.)
│   ├── audits/          # Client-side audit/validation utilities
│   ├── exports/         # Export generators (PDF, Excel, PNG, CSV, PPTX)
│   └── financial/       # Financial engine (calculators, types, utils)
└── pages/               # Route-level page components
```

## Module Boundaries

### Rule: features/ = self-contained, components/ = shared
- `features/` modules own their hooks, types, components, and API calls
- `components/` contains shared UI used across multiple pages
- `components/ui/` contains shadcn primitives + custom app components (see catalog below)

### Rule: Import direction
- Pages import from features, components, hooks, and lib
- Features may import from lib and components/ui, NOT from other features
- Components may import from lib and components/ui
- lib has no UI imports

## UI Component Catalog (`components/ui/`)

### shadcn Primitives (standard — do not modify except via shadcn CLI)
`Accordion`, `AlertDialog`, `Alert`, `AspectRatio`, `Avatar`, `Badge`, `Breadcrumb`, `Button`, `Calendar`, `Card`, `Carousel`, `Chart`, `Checkbox`, `Collapsible`, `Command`, `ContextMenu`, `Dialog`, `Drawer`, `DropdownMenu`, `Form`, `HoverCard`, `Input`, `InputOTP`, `Label`, `Menubar`, `NavigationMenu`, `Pagination`, `Popover`, `Progress`, `RadioGroup`, `Resizable`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Sidebar`, `Skeleton`, `Slider`, `Sonner`, `Switch`, `Table`, `Tabs` (CAUTION: has custom `CurrentThemeTab` at bottom — never overwrite), `Textarea`, `Toast`, `Toaster`, `Toggle`, `ToggleGroup`, `Tooltip`

### Tooltips (4 types)
| Component | Icon | Import | Use For |
|-----------|------|--------|---------|
| `Tooltip` + `TooltipTrigger` + `TooltipContent` | Custom | `@/components/ui/tooltip` | Base Radix primitive — use when you need a fully custom trigger element |
| `HelpTooltip` | `?` (HelpCircle) | `@/components/ui/help-tooltip` | Financial table line items — internal transparency feature. Props: `text`, `light?`, `side?`, `manualSection?`, `manualLabel?` |
| `InfoTooltip` | `i` (Info) | `@/components/ui/info-tooltip` | Form input fields — concept definitions. Props: `text`, `formula?` (renders monospace code block), `light?`, `side?`, `manualSection?`, `manualLabel?` |
| `ChartTooltip` + `ChartTooltipContent` | None (hover) | `@/components/ui/chart` | Recharts data-point hover tooltips inside charts. Used by all chart components in `lib/charts/`. Props: `cursor?`, `content` (pass `<ChartTooltipContent hideLabel? indicator? nameKey? />`) |

**Chart Tooltip usage** — Every chart in `lib/charts/` uses `ChartTooltip` + `ChartTooltipContent` from the shadcn chart system. These show formatted values when hovering over data points, bars, or slices. The `FinancialChart` component (`components/ui/financial-chart.tsx`) also uses the Recharts `Tooltip` directly with a `tooltipFormatter` prop for custom value formatting (defaults to `formatMoney`).

### Buttons & Actions
| Component | Import | Description |
|-----------|--------|-------------|
| `SaveButton` | `@/components/ui/save-button` | Standard save button with loading state. Props: `onClick`, `disabled`, `isPending`, `label?` |
| `ButtonGroup` | `@/components/ui/button-group` | Group related buttons with `ButtonGroupText` for labels |
| `ExportMenu` | `@/components/ui/export-toolbar` | Dropdown menu with export actions. Use with `pdfAction()`, `csvAction()`, `excelAction()`, `pptxAction()`, `pngAction()` helpers |

### Cards & Containers
| Component | Import | Description |
|-----------|--------|-------------|
| `StatCard` | `@/components/ui/stat-card` | KPI card with label, value, trend. Props: `title`, `value`, `format?` ("money"/"percent"/"number"/"text"), `trend?`, `icon?` |
| `SectionCard` | `@/components/ui/section-card` | Titled card section with optional actions. Props: `title`, `description?`, `children`, `actions?` |
| `EntityCardContainer` | `@/components/ui/entity-card` | Card for entity lists (properties, companies). Handles click, selection, actions |
| `ContentPanel` | `@/components/ui/content-panel` | Full-width content container with consistent padding |
| `PageHeader` | `@/components/ui/page-header` | Page title bar with optional back link and action buttons. Props: `title`, `subtitle?`, `backLink?`, `actions?` |
| `Callout` | `@/components/ui/callout` | Alert box with severity. Props: `severity` ("warning"/"critical"/"info"/"success"), `variant` ("dark"/"light"), `title?`, `children` |
| `Empty` | `@/components/ui/empty` | Empty state placeholder with `EmptyHeader`, `EmptyMedia`, composable sub-components |

### Form Components
| Component | Import | Description |
|-----------|--------|-------------|
| `FieldSet` / `FieldGroup` / `FieldLegend` | `@/components/ui/field` | Semantic form grouping with consistent spacing |
| `InputGroup` | `@/components/ui/input-group` | Input with prefix/suffix addons (e.g., "$" prefix, "%" suffix) |
| `NativeSelect` | `@/components/ui/native-select` | Native `<select>` element (use when shadcn Select is overkill) |
| `EditableValue` | `@/components/ui/editable-value` | Inline-editable numeric value. Props: `value`, `onChange`, `format` ("percent"/"dollar"/"months"/"number") |
| `ColorPicker` | `@/components/ui/color-picker` | Color swatch picker with preset colors + custom hex input. Props: `value`, `onChange` |
| `ImageCropDialog` | `@/components/ui/image-crop-dialog` | Dialog for cropping uploaded images before saving |
| `AIImagePicker` | `@/components/ui/ai-image-picker` | Multi-mode image input: upload, AI generate, or paste URL. Props: `onSelect`, `aspectRatio?` |

### Badges & Status
| Component | Import | Description |
|-----------|--------|-------------|
| `StatusBadge` | `@/components/ui/status-badge` | Dot + label badge. Props: `status` ("active"/"inactive"/"pending"/"error"/"warning"), `label?` |
| `GaapBadge` | `@/components/ui/gaap-badge` | GAAP compliance rule badge. Props: `rule`, `className?` |
| `ResearchBadge` | `@/components/ui/research-badge` | Data source badge. Props: `source` ("market"/"industry"/"ai"/"seed"), `entries?` |

### Financial & Data
| Component | Import | Description |
|-----------|--------|-------------|
| `FinancialChart` | `@/components/ui/financial-chart` | Multi-series line/bar chart. Props: `data`, `series` (string[] or ChartSeries[]), `title?` |
| `FinancialTable` | `@/components/ui/financial-table` | Generic financial data table. Props: `columns` (FinancialTableColumn[]), `rows` (FinancialTableRow[]) |
| `ManualTable` | `@/components/ui/manual-table` | Simple table for documentation/manuals. Props: `headers`, `rows`, `variant?` ("dark"/"light") |

### Media & Visual
| Component | Import | Description |
|-----------|--------|-------------|
| `ImagePreviewCard` | `@/components/ui/image-preview-card` | Image thumbnail with aspect ratio options. Props: `src`, `alt`, `aspect?` |
| `AnimatedLogo` | `@/components/ui/animated-logo` | Logo with animation modes. Props: `src`, `mode` ("none"/"pulse"/"glow"/"spin"/"bounce"), `size?` |
| `UserAvatar` | `@/components/ui/user-avatar` | User avatar with initials fallback. Props: `name`, `avatarUrl?`, `size?` ("sm"/"md"/"lg") |
| `Spinner` | `@/components/ui/spinner` | Loading spinner SVG |

### Animation
| Component | Import | Description |
|-----------|--------|-------------|
| `FadeIn`, `FadeInUp`, `ScaleIn`, `SlideIn` | `@/components/ui/animated` | Framer-motion wrapper components. Props: `delay?`, `duration?`, `className?` |
| `StaggerContainer`, `AnimatedCounter`, `HoverScale` | `@/components/ui/animated` | Container stagger, number counter animation, hover scale effect |

### Special Effects (Magic UI) — full reference: `.claude/skills/ui/magic-ui.md`
| Component | Import | Description |
|-----------|--------|-------------|
| `Particles` | `@/components/ui/particles` | Mouse-interactive canvas particle background |
| `NumberTicker` | `@/components/ui/number-ticker` | Spring-physics counting number — preferred over `AnimatedCounter` for new financial displays |
| `BlurFade` | `@/components/ui/blur-fade` | Blur-in reveal on mount or scroll entry |
| `ShimmerButton` | `@/components/ui/shimmer-button` | Light-sweep shimmer CTA button |
| `AnimatedGradientText` | `@/components/ui/animated-gradient-text` | Animated gradient-shift text |
| `Ripple` | `@/components/ui/ripple` | Concentric expanding ring animation |
| `AuroraText` | `@/components/ui/aurora-text` | Aurora color-shift display heading |
| `AnimatedBeam` | `@/components/ui/animated-beam` | SVG animated beam connecting two refs |
| `Meteors` | `@/components/ui/meteors` | CSS falling-streak card background |

### Utility
| Component | Import | Description |
|-----------|--------|-------------|
| `Kbd` / `KbdGroup` | `@/components/ui/kbd` | Keyboard shortcut display (`⌘K` style) |
| `DirectionProvider` / `useDirection` | `@/components/ui/direction` | LTR/RTL context provider |
| `TypographyH1`–`H4`, `TypographyP`, `TypographyLead`, `TypographyLarge` | `@/components/ui/typography` | Semantic typography components with consistent styles |

## Barrel Files (index.ts)

Barrel files aggregate exports from a directory into a single import path.

| Directory | Barrel | Exports |
|-----------|--------|---------|
| `components/admin/` | `index.ts` | All admin tab components |
| `components/dashboard/` | `index.ts` | Dashboard tabs and hooks |
| `components/financial-table/` | `index.ts` | Row components, table shell |
| `components/property-detail/` | `index.ts` | Detail sub-components |
| `components/property-edit/` | `index.ts` | Edit form sections |
| `components/property-research/` | `index.ts` | Research sub-components |
| `components/property-finder/` | `index.ts` | Finder sub-components |
| `components/` | `IndustryResearchTab.tsx` | Industry research settings tab |
| `lib/api/` | `index.ts` | API client modules |
| `lib/financial/` | `index.ts` | Financial engine (types, utils, calculators) |
| `lib/exports/` | `index.ts` | Export utilities |
| `lib/exports/excel/` | `index.ts` | Excel-specific exports |

## Thin Re-export Wrappers

These files re-export from a canonical source to provide backward-compatible or convenience import paths. They contain zero logic — pure `export` statements only.

| Wrapper | Source of Truth | Purpose |
|---------|----------------|---------|
| `components/financial-table-rows.tsx` | `./financial-table/index` | Legacy path |
| `components/ConsolidatedBalanceSheet.tsx` | `./statements/ConsolidatedBalanceSheet` | Legacy path |
| `lib/api.ts` | `./api/index` | Shorthand `@/lib/api` |
| `lib/financialEngine.ts` | `./financial` | Re-export shim — new code should import from `@/lib/financial/property-engine` or `@/lib/financial/company-engine` |
| `lib/exports/excelExport.ts` | `./excel/index` | Legacy path |
| `pages/CheckerManual.tsx` | `./checker-manual/index` | Router entry |

### Wrapper Rules
1. Wrappers must be pure re-exports — no logic, no side effects
2. New code should import from the canonical source, not wrappers
3. Never create new wrappers — use barrel files instead
4. Orphan wrappers (zero importers) should be deleted during cleanup

## Animation Modules

Two complementary animation modules exist:

| Module | Path | Components | Used By |
|--------|------|------------|---------|
| Motion primitives | `components/ui/animated.tsx` | FadeIn, FadeInUp, ScaleIn, SlideIn, StaggerContainer, AnimatedCounter, HoverScale, etc. (12 exports) | 4 files (cards, portfolio) |
| Page transitions | `components/graphics/AnimatedPage.tsx` | AnimatedPage, AnimatedSection, AnimatedGrid, ScrollReveal (5 exports) | 25+ pages |

These are complementary, NOT duplicates. Do not consolidate without checking all consumers.

## Helper Functions & Utilities

### lib/themeUtils.ts — Theme Engine
- `hexToHslString(hex)` — Convert hex to CSS HSL string
- `applyThemeColors(colors)` — Inject DesignColor[] as :root CSS variables
- `resetThemeColors()` — Remove all dynamic theme variables

### lib/financial/ — Financial Engine
Core calculation engines. Never use LLM to compute financial values.
- `property-engine.ts` — Single-property pro-forma (`generatePropertyProForma`, ~601 lines)
- `company-engine.ts` — Management-company pro-forma (`generateCompanyProForma`, ~361 lines)
- `../financialEngine.ts` → re-export shim from `./financial/` (backward compat only)
- Calculators: loan, cash flow, returns, depreciation, tax
- Types: all financial interfaces

### lib/exports/ — Export Generators
- `pdfChartDrawer.ts` — Draw charts in jsPDF documents
- `pptxExport.ts` — PowerPoint generation
- `pngExport.ts` — PNG table captures via dom-to-image
- `csvExport.ts` — CSV downloads
- `excel/` — Multi-sheet Excel workbooks

### lib/api/ — API Client
- `properties.ts`, `admin.ts`, `research.ts`, `scenarios.ts`, `services.ts`
- `types.ts` — shared API response interfaces

### lib/audits/ — Client-side Validation
- `crossCalculatorValidation.ts` — cross-check financial calculators
- `formulaChecker.ts` — verify formula correctness
- `helpers.ts` — shared audit utilities

## Scripts (`script/`)

| Script | Command | Purpose |
|--------|---------|---------|
| `health.ts` | `npm run health` | tsc + tests + verification |
| `stats.ts` | `npm run stats` | Codebase metrics |
| `audit-quick.ts` | `npm run audit:quick` | Quality scan |
| `test-summary.ts` | `npm run test:summary` | Compact test output |
| `test-file.ts` | `npm run test:file -- <path>` | Single file test |
| `lint-summary.ts` | `npm run lint:summary` | tsc --noEmit check |
| `diff-summary.ts` | `npm run diff:summary` | Git diff stats |
| `build.ts` | `npm run build` | Production build |
| `exports-check.ts` | `npm run exports:check` | Find unused exports |
| `seed-preset-themes.ts` | `npx tsx script/seed-preset-themes.ts` | Seed 5 preset themes |
| `seed-lb-brand-theme.ts` | `npx tsx script/seed-lb-brand-theme.ts` | Seed L+B Brand theme |
| `seed-production.sql` | Manual | Production data sync |
| `manual-sync/` | Manual | 00-06 SQL sync scripts |
| `admin-structure.ts` | Manual | Analyze admin page |
| `create-boutique-logos.ts` | Manual | Seed boutique hotel logos |
| `list-tables.ts` | Manual | List DB tables |

## Cleanup Checklist

When auditing the codebase:
1. Run `npm run exports:check` — find unused exports
2. Search for orphan wrappers: re-export files with zero importers
3. Check `components/` for feature-specific code that should be in `features/`
4. Verify all barrel files export everything from their directory
5. Confirm no `console.log` in production code (except AI agent debug logs)
