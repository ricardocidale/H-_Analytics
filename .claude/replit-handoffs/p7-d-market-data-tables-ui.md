# Phase 7-D: Market Data Tables admin UI

## Doctrine Freeze Gate Check

- **Governing ADR(s):** ADR-001 (two-tier architecture), ADR-006 (Resources control plane)
- **ADR status:** `Accepted`
- **Last ADR edit:** 2026-04-21
- **Sessions stable:** 3+
- **Gate decision:** ✅ Cleared to execute

---

## Context

Five market data reference tables (hospitality benchmarks, market ADR index, labor rates,
F&B benchmarks, seasonal calendars) are seeded from real research data and stored in the DB.
The specialists and The Analyst read from them during evaluations. The admin needs a way to:
1. **View** the tables (read-only) under AI Intelligence → Resources → Tables
2. **Refresh** any table by clicking "Ask the Analyst" — the backend does a grounded web
   search + Claude extraction and upserts the results.

CC just shipped the backend (commit `7bd5583f`):
- `GET  /api/admin/market-data-tables`          → catalog (names, row counts, last updated)
- `GET  /api/admin/market-data-tables/:table`   → all rows for a table
- `POST /api/admin/market-data-tables/:table/refresh` → trigger Analyst refresh

**This packet is UI-only.** No backend changes needed.

Tables and their contents:
| Slug | Label | What it contains |
|------|-------|-----------------|
| `hospitality-benchmarks` | Hospitality Benchmarks | ADR, occupancy, RevPAR, cap rates, management fees by segment |
| `market-adr-index` | Market ADR Index | Quarterly ADR by city (luxury, upscale, boutique, economy) |
| `labor-rates` | Labor Rates | Staff wages by role and market |
| `fb-benchmarks` | F&B Benchmarks | Ticket averages, cost of goods, labor % |
| `seasonal-calendars` | Seasonal Calendars | Peak/shoulder/trough demand multipliers by month |

---

## Atomic-budget check

- **Sub-step count:** 3 ✅
- **File count:** 3 ✅
- **Capability domains touched:** UI (new component), UI (new page section), UI (sidebar wire-up) ✅

---

## Tasks

### S1: Create `MarketDataTablesPage.tsx`

- **File:** `client/src/pages/ai-intelligence/MarketDataTablesPage.tsx` (new file)

- **What it does:**
  - Fetches the catalog via `GET /api/admin/market-data-tables`
  - Shows all 5 tables as expandable accordion sections
  - Each section header: table label + row count badge + last-updated timestamp + "Ask the Analyst" button
  - Each expanded section: a read-only data table with the rows from `GET /api/admin/market-data-tables/:table`
  - "Ask the Analyst" button calls `POST /api/admin/market-data-tables/:table/refresh` and shows a loading state + toast on completion

- **Read-only rule:** No edit buttons, no inline inputs, no PUT calls. Display only.

- **Column display per table:**
  - `hospitality-benchmarks`: category · segment · metricLabel · value+unit · sourceName · sourceYear · country
  - `market-adr-index`: market · country · quarter · avgAdr · boutiqueAdr · avgOccupancy · source
  - `labor-rates`: market · country · role · hourlyRate · annualSalary · currency · source · sourceYear
  - `fb-benchmarks`: market · country · propertyType · avgTicketPerPerson · fbCostOfGoodsPercent · fbLaborCostPercent · source
  - `seasonal-calendars`: market · country · month · seasonType · demandMultiplier · notes

- **Source citation row** below each table: italicized text showing `meta.sourceNote` from the catalog (e.g. "STR/CoStar, CBRE, HVS, PwC, AHLA")

- **Ask the Analyst UX:**
  1. Button label: "Ask the Analyst" with `IconSparkles` icon (use `<AnalystButton />` label copy only — the actual button is a standard `<Button>` component since this is admin-only)
  2. While pending: spinner + "The Analyst is studying current market data…"
  3. On success: green toast "Updated — N rows refreshed" + table re-fetches automatically
  4. On error: destructive toast with the error message

- **data-testid requirements:**
  - `data-testid="page-market-data-tables"` — outer wrapper
  - `data-testid="table-section-{slug}"` — each accordion section (e.g. `table-section-hospitality-benchmarks`)
  - `data-testid="button-refresh-{slug}"` — Analyst refresh button per table
  - `data-testid="badge-row-count-{slug}"` — row count badge

- **Styling:** follow design-standards.md (premium, glassmorphism cards, skeleton loading, staggered reveals via Framer Motion). Each table section is a `Card` with `bg-white/80 backdrop-blur-xl`. No bare tables — pair each data table with a brief source citation and freshness info.

- **Acceptance criteria:**
  - [ ] `tsc --noEmit` 0 errors
  - [ ] Catalog loads and shows 5 sections with row counts
  - [ ] Expanding a section fetches and displays its rows
  - [ ] "Ask the Analyst" sends `POST …/refresh`, shows pending state, shows success toast
  - [ ] No edit inputs visible anywhere on the page
  - [ ] `data-testid="page-market-data-tables"` is present in DOM

---

### S2: Wire into `AiIntelligence.tsx`

- **File:** `client/src/pages/AiIntelligence.tsx`

- **What to add:** Import `MarketDataTablesPage` (lazy) and add it to `SectionContent`:

```tsx
// Add lazy import near the top (with other lazy imports):
const MarketDataTablesPage = lazy(() => import("@/pages/ai-intelligence/MarketDataTablesPage"));

// Add to sectionMeta (alongside existing keys):
"resources-tables": { title: "Market Data · Reference Tables", subtitle: "Industry benchmarks and market data tables used by The Analyst. Read-only; refreshed by The Analyst on demand." },

// In SectionContent switch — replace the current "resources-tables" case:
case "resources-tables":
  return <MarketDataTablesPage />;
```

  Currently `resources-tables` renders `<ResourcesTab kind="table" />` which shows the
  admin_resources metadata table. Replace that case with the new page — the market data
  tables page IS the meaningful content for this section.

- **Acceptance criteria:**
  - [ ] Navigating to AI Intelligence → Resources → Tables shows the new page
  - [ ] The existing `ResourcesTab kind="table"` no longer renders at this route
  - [ ] No TypeScript errors

---

### S3: Update sidebar label for Resources → Tables

- **File:** `client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`

- **What to change:** The current sidebar label for `resources-tables` is "Resources · Tables" (generic). Update the description/tooltip text to reflect the new content:

  Find the entry for `"resources-tables"` in the sidebar group items array and change:
  - Icon: keep `IconDatabase`
  - Label: "Market Data" (shorter, clearer)
  - Tooltip/description: "Industry benchmarks, ADR index, labor rates, F&B, and seasonal calendars — refreshed by The Analyst"

- **Acceptance criteria:**
  - [ ] Sidebar shows "Market Data" label under Resources group
  - [ ] No TypeScript errors
  - [ ] No new lint warnings

---

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run lint` — 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — all tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification (dev server)

- [ ] Navigate to `/ai-intelligence` → click "Resources" group → click "Market Data"
- [ ] Page shows 5 accordion sections with labels and row counts (not zero)
- [ ] Expanding "Hospitality Benchmarks" shows a table of ADR/occupancy/cap rate data
- [ ] "Ask the Analyst" button on any section triggers a loading state
- [ ] After refresh completes, a success toast appears and the row count may update
- [ ] Page shows source citations under each table (e.g. "STR/CoStar, CBRE, HVS…")
- [ ] No edit inputs, no PUT/PATCH buttons visible

---

## Out of scope

- **Per-row edit UI** — admins cannot manually edit rows. Only The Analyst can write.
- **Market filter** — the refresh sends `market: null` (refreshes all markets). A market selector is a future enhancement.
- **Specialist ownership badges** — which specialist owns each table is a future enhancement.
- **ResourcesTab kind="table"** — the old generic table inspector remains in the codebase but is no longer the default view for this section.

---

## Surfaces footer template

Every commit from this packet must end with:

```
Surfaces: S7
Packet: .claude/replit-handoffs/p7-d-market-data-tables-ui.md
```

---

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Verification gates SKIPPED with reason:** _
- **Out-of-scope items discovered:** _
- **Session-memory entry added:** ❌
