---
name: admin-components
description: Admin panel component architecture, shared hooks, styles, and reusable components. Use when creating or modifying any admin tab, adding new admin sections, or working with admin UI patterns.
---

# Admin Panel Components

## Architecture

The admin panel uses a **5-group sidebar layout** (`AdminSidebar.tsx`) with these groups:

| Group | Sections |
|-------|----------|
| People | Users, Groups, Activity |
| Platform | Branding, Themes, Logos, Navigation |
| Business | Companies, Services, Market Rates |
| AI Agent | Rebecca |
| System | Verification, Database |

`Admin.tsx` renders the sidebar + a content area. Each section maps to a standalone component in `client/src/components/admin/`.

## Shared Hooks (`client/src/components/admin/hooks.ts`)

```typescript
import {
  adminFetch, adminMutate,
  useAdminLogos, useAdminUsers, useAdminCompanies,
  useGlobalAssumptions, useUpdateGlobalAssumptions,
  useCreateLogo, useDeleteLogo,
  useEnhanceLogoPrompt, useGenerateLogoImage,
} from "./hooks";
```

### Data Fetching
- `adminFetch<T>(url, errorMsg)` — returns a query function for `useQuery`
- `useAdminLogos()` — fetches logo portfolio (`Logo[]`)
- `useAdminUsers()` — fetches user list (`User[]`)
- `useAdminCompanies()` — fetches company list (`AdminCompany[]`)
- `useGlobalAssumptions()` — fetches global settings

### Mutations
- `adminMutate(url, method)` — returns a mutation function for `useMutation`
- `useUpdateGlobalAssumptions()` — updates global settings (auto-invalidates financial queries, toasts on error)
- `useCreateLogo()` — creates a logo (auto-invalidates logos + branding queries, toasts on success/error)
- `useDeleteLogo()` — deletes a logo by ID (auto-invalidates, toasts)

### AI Hooks
- `useEnhanceLogoPrompt()` — returns `{ enhance(prompt): Promise<string | null>, isEnhancing }`. Calls `POST /api/enhance-logo-prompt` (Gemini).
- `useGenerateLogoImage()` — returns `{ generate(prompt): Promise<string | null>, isGenerating }`. Calls `POST /api/generate-property-image` (Nano Banana).

**Rule:** All admin tabs must use shared hooks from `hooks.ts`. No inline `fetch()` calls for standard admin CRUD.

## Shared Styles (`client/src/components/admin/styles.ts`)

```typescript
import { ADMIN_CARD, ADMIN_LINK_CARD, ADMIN_LINK_ICON, ADMIN_TEXTAREA, LOGO_PREVIEW, ADMIN_DIALOG } from "./styles";
```

- `ADMIN_CARD` — clean card class using CSS variables (`bg-card border-border shadow-sm`)
- `ADMIN_LINK_CARD` — navigation link card style
- `ADMIN_LINK_ICON` — icon container in link cards
- `ADMIN_TEXTAREA` — styled textarea for admin forms (non-bold, muted text)
- `LOGO_PREVIEW` — logo thumbnail container (14x14 rounded with dashed border)
- `ADMIN_DIALOG` — dialog width class (`sm:max-w-lg`)

## Reusable Components

### LogoSelector (`client/src/components/admin/LogoSelector.tsx`)

Drop-in logo picker with thumbnail preview. Uses `useAdminLogos()` internally.

```tsx
import LogoSelector from "./LogoSelector";

<LogoSelector
  label="Company Logo"
  value={globalAssumptions?.companyLogoId ?? null}
  onChange={(logoId) => mutation.mutate({ companyLogoId: logoId })}
  showNone={true}
  emptyLabel="Default Logo"
  testId="select-company-logo"
/>
```

Props:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | string | required | Field label |
| `value` | number \| null | required | Selected logo ID |
| `onChange` | (id: number \| null) => void | required | Selection handler |
| `showNone` | boolean | `true` | Show "No Logo" option |
| `useDefaultFallback` | boolean | `false` | When value is null, auto-select default logo |
| `emptyLabel` | string | `"No Logo"` | Label for empty option |
| `helpText` | string | `"Select from Logo Portfolio"` | Help text below selector |
| `testId` | string | `"select-logo"` | data-testid for selector |
| `fallbackUrl` | string | default logo asset | Fallback image URL |

**Rule:** Always use `LogoSelector` for logo selection UI. Do not build inline logo selectors.

### ThemePreview (`client/src/features/design-themes/ThemePreview.tsx`)

Live preview component showing sample UI elements (buttons, dialogs, menus, cards, badges, notifications, chart bars) that all render using current CSS variable theme tokens. Shows users exactly what their theme changes affect.

Rendered inside `ThemeManager` between the "Current Theme" card and the "All Themes" list. Collapsible via eye icon.

## Barrel Files & Re-exports (Canonical Wrappers)

The codebase uses barrel files (`index.ts`) and thin re-export wrappers to provide clean import paths. These are intentional and must be maintained.

### Barrel Files (index.ts aggregators)
| Barrel File | Aggregates |
|-------------|------------|
| `components/admin/index.ts` | All admin tabs (UsersTab, MarcelaTab, etc.) |
| `components/admin/marcela/index.ts` | Marcela admin sub-components |
| `components/dashboard/index.ts` | Dashboard tabs and hooks |
| `components/financial-table/index.ts` | Row components and table shell |
| `components/property-detail/index.ts` | Property detail sub-components |
| `components/property-edit/index.ts` | Property edit sub-components |
| `components/property-research/index.ts` | Research sub-components |
| `components/property-finder/index.ts` | Property finder sub-components |
| `components/IndustryResearchTab.tsx` | Industry research settings tab |
| `features/ai-agent/index.ts` | AI agent UI components |
| `features/ai-agent/components/index.ts` | 16+ AI agent UI components |
| `features/ai-agent/hooks/index.ts` | All AI agent hooks + AI_AGENT_KEYS |
| `lib/api/index.ts` | API modules (types, properties, admin, research, etc.) |
| `lib/financial/index.ts` | Financial engine (types, utils, calculators) |
| `lib/exports/index.ts` | Export utilities (Excel, PDF, PNG, CSV, PPTX) |
| `lib/exports/excel/index.ts` | Excel-specific exports |

### Thin Re-export Wrappers (convenience imports)
These exist so other code can import from a shorter/legacy path without breaking.

| Wrapper File | Source of Truth | Used By |
|-------------|----------------|---------|
| `components/admin/MarcelaTab.tsx` | `./marcela/MarcelaTab` | `admin/index.ts` barrel |
| `components/admin/marcela/hooks.ts` | `@/features/ai-agent/hooks` | Marcela admin tab |
| `components/admin/marcela/types.ts` | `features/ai-agent/types` | Marcela admin tab |
| `components/financial-table-rows.tsx` | `./financial-table/index` | Legacy import path |
| `components/ConsolidatedBalanceSheet.tsx` | `./statements/ConsolidatedBalanceSheet` | Legacy import path |
| `lib/api.ts` | `./api/index` | Convenience shorthand |
| `lib/financialEngine.ts` | `./financial` | Re-export shim (new code should import from `financial/property-engine` or `financial/company-engine`) |
| `lib/exports/excelExport.ts` | `./excel/index` | Legacy import path |
| `pages/CheckerManual.tsx` | `./checker-manual/index` | Router entry point |

**Rules:**
1. Never duplicate logic in a wrapper — it must be a pure `export { ... } from "..."` or `export * from "..."`
2. When adding new features, import from the canonical source (barrel or feature module), not from wrappers
3. Do not create new thin wrappers — use barrel files instead
4. Periodically audit for orphan wrappers (wrappers with zero external imports) and remove them

## Upload Flow

File uploads use the direct server upload endpoint (bypasses CORS issues with GCS):

1. Client reads file as `ArrayBuffer`
2. `POST /api/uploads/direct` with binary body and `Content-Type` header
3. Server validates size (max 10MB) and content type (images only)
4. Server writes to object storage, returns `{ objectPath }`
5. `objectPath` is stored in DB and served via `GET /objects/{path}`

Hook: `useUpload()` from `client/src/hooks/use-upload.ts`

Server route: `server/routes/uploads.ts`

## AI Logo Generation Flow (LogosTab)

The Add Logo dialog has three modes:
1. **Generate Logo** — AI-powered via Nano Banana (Gemini image model)
2. **Import Logo** — file upload with crop dialog
3. **URL Logo** — paste a direct URL

AI Generation sub-flow:
1. User describes logo in textarea
2. Option A: "Generate Logo" — sends prompt directly to Nano Banana
3. Option B: "Enhance with AI" — calls Gemini text model to improve the prompt, then shows enhanced version with Edit Further / Cancel / Generate options

Server endpoints:
- `POST /api/enhance-logo-prompt` — Gemini text enhancement (`server/replit_integrations/image/routes.ts`)
- `POST /api/generate-property-image` — Nano Banana image generation + object storage upload

Image client: `server/replit_integrations/image/client.ts`

## Design System

All UI follows the shadcn component pattern:
- **Buttons**: Use shadcn `Button` from `@/components/ui/button` — never custom button components
- **Cards**: Use shadcn `Card` or CSS variable tokens (`bg-card`, `border-border`, `shadow-sm`)
- **Colors**: Always CSS variables (`text-foreground`, `text-muted-foreground`, `bg-muted`) — never hardcoded hex colors
- **Variants**: Use `cva` from class-variance-authority for component variants
- **Exports**: Use shadcn `DropdownMenu` for export menus (via `ExportToolbar`)

## Theme System

### Preset Themes (seeded via `script/seed-preset-themes.ts`)
| Theme | Primary | Vibe |
|-------|---------|------|
| L+B Brand | Sage Green `#9FBCA4` | Original earthy hospitality brand |
| Muted Sage | Olive Sage `#8A9A7B` | Earth tone, warm naturals |
| Midnight Navy | Navy `#2C3E6B` | Professional, institutional trust |
| Warm Charcoal | Warm Slate `#6B7280` | Modern editorial, minimal |
| Deep Teal | Teal `#0D7377` | Coastal luxury, blue-green |
| Steel Blue | Steel Blue `#6889A8` | Soft, approachable professional |

### Theme Color Ranks (PALETTE: prefix)
| Rank | Maps to | CSS Variables |
|------|---------|---------------|
| 1 | Primary | `--primary`, `--accent`, `--ring`, `--sidebar-primary` |
| 2 | Secondary | `--secondary` |
| 3 | Background | `--background`, `--card`, `--popover` |
| 4 | Foreground | `--foreground`, `--card-foreground`, `--popover-foreground` |
| 5 | Muted | `--muted`, `--sidebar-accent` |
| 6 | Border | `--border`, `--input`, `--sidebar-border` |

### Chart Color Ranks (CHART: prefix)
Ranks 1–5 map to `--chart-1` through `--chart-5`.

Engine: `client/src/lib/themeUtils.ts` (`applyThemeColors()` / `resetThemeColors()`)

Applied in: `client/src/components/Layout.tsx` via `useEffect` on branding query.

## Help Tooltip Explainers (`?` Icons)

The `?` tooltip pattern is an **internal transparency feature** — it explains how each financial line item is calculated, giving users confidence in the numbers without needing to read external documentation.

### Component
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";

<HelpTooltip text="Income from guest room bookings. Calculated as Room Count × Days × ADR × Occupancy." />
```

### Where They Appear
| Location | Component | Gated By |
|----------|-----------|----------|
| Property Income Statement | `YearlyIncomeStatement.tsx` | `useCalcDetails()` (toggle) |
| Consolidated Dashboard | `IncomeStatementTab.tsx` | Always visible |
| Property Balance Sheet | `ConsolidatedBalanceSheet.tsx` | `useCalcDetails()` |

### Rules
1. Every financial line item (revenue, expense, fee, metric) should have a `tooltip` explaining what it is and how it's calculated
2. Use `HelpTooltip` (`?` icon) for financial tables, `InfoTooltip` (`i` icon) for form inputs — see `codebase-architecture` skill for the full tooltip catalog
3. Tooltips describe the **formula or source**, not just a label restatement (e.g., "Calculated as Room Count × Days × ADR × Occupancy" not "Revenue from rooms")
4. In `LineItem` / `MetricRow` / `SubtotalRow` components: pass `tooltip` prop — the `?` icon renders automatically when `useCalcDetails()` is true
5. In the consolidated dashboard: tooltips render always (no toggle gating) via inline `HelpTooltip` in the row render
6. Tooltip text must never include actual computed values — only formula descriptions and parameter names

### Covered Line Items
**Revenue:** Room Revenue, F&B Revenue, Event Revenue, Other Revenue
**Metrics:** ADR (Rate), ADR (Effective), Occupancy, RevPAR, Total Rooms Available
**Expenses:** All operating expense categories (Housekeeping, F&B, Events, Marketing, Property Ops, Admin & General, IT, Utilities)

## Conventions

1. Every admin tab uses shared hooks from `hooks.ts` — no inline fetches
2. Card class: always use `ADMIN_CARD` constant
3. Mutations show toast on success/error via `useToast()`
4. All interactive elements need `data-testid` attributes
5. Icons from `lucide-react`, titles use `font-display` class
6. Button labels: always "Save", never "Update"
7. No hardcoded hex colors — use CSS variable tokens
8. Use shadcn `Button` (not GlassButton, which is deleted)

## Adding a New Admin Section

1. Create component in `client/src/components/admin/NewTab.tsx`
2. Import hooks from `./hooks` for data fetching
3. Use `ADMIN_CARD` from `./styles` for card containers
4. Add section to `AdminSidebar.tsx` (type + config)
5. Add rendering case in `Admin.tsx`
6. Export from `./index.ts`

## Types (`client/src/components/admin/types.ts`)

Shared interfaces: `User`, `Logo`, `UserGroup`, `AdminCompany`, `LoginLog`, `ActiveSession`, `ActivityLogEntry`, `CheckerSummary`, `VerificationHistoryEntry`, `DesignCheckResult`, `AssetDesc`

## Scripts

| Script | Purpose |
|--------|---------|
| `script/seed-preset-themes.ts` | Seed 5 preset design themes (idempotent) |
| `script/seed-lb-brand-theme.ts` | Seed original L+B Brand theme |
| `script/admin-structure.ts` | Analyze admin page structure |
| `script/verify-admin-refactor.ts` | Verify admin refactor consistency |
