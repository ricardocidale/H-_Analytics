# T2-7 — Horizontal Tabs → Collapsible UI: Audit

**Status:** Audit complete — implementation not started  
**Date:** 2026-05-18  
**Owner:** Replit-safe (UI refactor); CC produced this audit

---

## Purpose

T2-7 replaces horizontal-tab navigation on non-main pages with a collapsible UI pattern (modeled on AgentRosterAccordion). This document is the Done-When criterion #1 for T2-7.

---

## Excluded pages (keep horizontal tabs — §13 mandates `<CurrentThemeTab>`)

| Page | Route | Reason |
|---|---|---|
| `pages/Dashboard.tsx` | `/` | Explicitly excluded |
| `pages/Company.tsx` | `/company` | Management Company page |
| `pages/PropertyDetail.tsx` | `/properties/:id` | Individual property page |
| `pages/PropertyFinder.tsx` | `/properties` | Properties list page |

### Resolved — `CompanyAssumptions` is in scope

**`pages/CompanyAssumptions.tsx`** (`/company/assumptions`) is **in scope** for the collapsible refactor (owner decision, 2026-05-18). The "Management Company page" exclusion covers only the main `Company.tsx` overview at `/company` — not the `/company/assumptions` editor. This page uses `CompanyAssumptionsTabsView` and is the canonical "Form/Editor" archetype; the refactor must preserve per-tab Save + AnalystButton semantics per CLAUDE.md.

---

## In-scope pages (12 candidates)

### 1. `pages/Analysis.tsx`
**Route:** `/analysis`  
**Tabs:** Sensitivity · Compare · Structures · Timeline · Financing · Capital Raise (6 tabs)  
**Indicator hypothesis:** Each tab is a distinct analysis mode. A collapsible row per mode with a 1-line description and an "IRR range / status" indicator chip would surface available analysis tools without needing to switch tabs.

### 2. `pages/Help.tsx`
**Route:** `/help`  
**Tabs:** User Manual · (Architecture — admin only) · Guided Tour (2–3 tabs)  
**Indicator hypothesis:** Low-priority; tabs are document sections, not data-driven. Collapsible sections would work but the current tabs are shallow enough to be low-risk either way.

### 3. `pages/LbSlides.tsx`
**Route:** `/slides` (or similar)  
**Sub-component:** `features/slide-factory/SlideFactoryPanel` renders the tab bar  
**Tabs:** Setup · 1·Spotlight · 2·Gallery · 3·Investment · 4·Portfolio · 5·Financials · 6·Statement (7 tabs)  
**Indicator hypothesis:** Each slide tab could show a `ReadinessTabBadge` (already exists). Collapsible rows with readiness indicators (amber = missing fields, green = ready) would give a full pipeline status at a glance. Note: readiness badges already live on the tab labels — collapsible makes them more prominent.

### 4. `pages/CompanyBracketMix.tsx`
**Route:** `/company/bracket-mix` (or similar)  
**Tabs:** Bracket Mix · Market Evidence · Data Sources · Legacy ICP (4 tabs)  
**Indicator hypothesis:** Each tab shows a different lens on the ICP configuration. A collapsible with "active bracket count / evidence quality" indicators per section would expose the health of each lens.

### 5. `pages/PropertyMarketResearch.tsx`
**Route:** `/properties/:id/research` (or similar)  
**Tabs:** Market · Revenue · Financial · Operating · Rates · Sources · Pipeline & STR · Criteria (8 tabs)  
**Indicator hypothesis:** Most tabs have Analyst-generated research sections. Collapsible rows with "freshness" or "coverage score" indicators per research dimension would show at a glance which sections have data and which are stale.

### 6. `pages/intelligence/UnifiedLogsPage.tsx`
**Route:** `/intelligence/logs`  
**Tabs:** Runs · Self-tests (2 tabs)  
**Indicator hypothesis:** Two log streams. Could show "last run status" and "pass/fail count" per category. Low complexity — good candidate for an early implementation.

### 7. `pages/admin/specialist/SpecialistPage.tsx`
**Route:** `/admin/specialists/:id`  
**Tabs:** Overview/Workflow · Identity · Sources · (server-dynamic additional tabs)  
**Indicator hypothesis:** Each tab represents a configuration facet. A collapsible with "configured / missing" indicators per facet would surface required-field gaps without requiring tab switching. Dynamic tabs from server need special handling.

### 8. `pages/intelligence/AnimationsPage.tsx`
**Route:** `/intelligence/animations`  
**Tabs:** Rebecca · The Analyst (2 tabs)  
**Indicator hypothesis:** Two AI systems with separate animation configs. Collapsible rows with health status indicator per system.

### 9. `pages/analysis/FundingPredictor.tsx`
**Route:** `/analysis/capital-raise` (sub-page from Analysis)  
**Tabs:** Capital Strategy (1 visible tab)  
**Indicator hypothesis:** Effectively single-content page; the tab bar adds little value. This may be out of scope since there's only one tab — the collapsible refactor would be a no-op. **Recommendation:** skip or verify whether additional tabs are planned.

### 10. `pages/analysis/FinancingAnalysis.tsx`
**Route:** `/analysis/financing` (sub-page from Analysis)  
**Tabs:** DSCR Sizing · Debt Yield · Stress Test · Prepayment (4 tabs)  
**Indicator hypothesis:** Each tab is a financing calculation mode. Collapsible rows with a "current sizing result" metric chip (e.g., "DSCR: 1.32x") per row would let users see all four outputs simultaneously.

### 11. `pages/CompanyAssumptions.tsx`
**Route:** `/company/assumptions`
**Sub-component:** `components/company-assumptions/CompanyAssumptionsTabsView.tsx` renders the tab bar
**Tabs:** server-driven (`TAB_LABELS[tabKeys]`) — typically Funding, Fees, Staffing, Overhead, Branding
**Indicator hypothesis:** Canonical Form/Editor archetype — each tab carries per-tab Save state and an AnalystButton. Collapsible rows must preserve per-section Save semantics (dirty flag, save mutation) and AnalystButton per section. Likely the highest-value collapsible refactor since users currently lose context switching tabs mid-edit. **Care needed:** preserve `onSaveStateChange` upward signaling to PageHeader (see `.local/tasks/research-center-save-button.md` for the prior pattern).

### 12. `pages/CompanyResearch.tsx`
**Route:** `/company/research`  
**Tabs:** Two-level nested tabs — 3 groups (Operations / Marketing / Industry) each with 5 sub-tabs  
**Sub-tabs:**
- Operations: Revenue & Fees · Cost Structure · Vendor Intelligence · Competitive Position · Criteria & Sources
- Marketing: Guest Personas · Capital & Investor · Market Sizing · Regional Opportunities · Criteria & Sources
- Industry: Hospitality Overview · Supply & Demand · Economic Climate · Trends & Innovation · Criteria & Sources  
**Indicator hypothesis:** The nested structure is the most complex. Group-level collapsibles (3 rows) that expand to reveal section-level collapsibles (5 per group) would match the current hierarchy. Alternatively, flatten to 15 section rows with group badges. **This is the highest-effort page.**

---

## Admin sub-components (excluded — sub-tabs within Admin page, not standalone pages)

These files hit the grep but are sub-tabs of `pages/Admin.tsx` which is admin-only:

| File | Tabs | Parent |
|---|---|---|
| `components/admin/model-defaults/CompanyTab.tsx` | Company · Fees & Financials · Overhead · Compensation | `ModelDefaultsTab` → `Admin.tsx` |
| `components/admin/ai/RebeccaAdminTabs.tsx` | AI Agents · Configuration · Guardrails · Feedback · Analytics | `Admin.tsx` |
| `components/admin/resources/ResourcesAdminPage.tsx` | APIs · Sources · Benchmark Slugs · Models | `Admin.tsx` |
| `components/admin/BrandAssetsPage.tsx` | Theme switcher tabs (one per theme — dynamic) | `Admin.tsx` |
| All other `components/admin/*` | Various | `Admin.tsx` |

**Decision:** Leave all Admin page tabs as-is. The Admin page is a power-user surface and benefits from horizontal navigation.

---

## Component context

### `components/company/CompanyHeader.tsx`
Used in `Company.tsx` (excluded). Tabs: Income Statement · Cash Flows · Balance Sheet · Financial Analysis. **Excluded.**

### `features/slide-factory/SlideFactoryPanel.tsx`
Used inside `LbSlides.tsx` (in-scope). Tabs: 1·Brief · 2·Lorenzo · 3·Properties · 4·Lucca · 5·Agents · 6·Download. These are the slide-factory workflow steps — distinct from the slide-preview tabs above. **Both tab sets live on the same in-scope page; the refactor must address both.**

### `features/design-themes/ThemeManager.tsx`
Dynamic tabs — one per installed theme. Admin-panel use only (likely inside Admin.tsx). If it's in the Admin page context, excluded.

---

## AgentRosterAccordion pattern reference

**File:** `components/intelligence/agent-roster/AgentRosterAccordion.tsx`  
**Used by:** `pages/intelligence/AgentsRosterPage.tsx`, `MinionsRosterPage.tsx`, `SpecialistsRosterPage.tsx`  
**Primitives used:** `Collapsible / CollapsibleContent / CollapsibleTrigger` from `@/components/ui/collapsible`

**Current API (per-entry):**
```ts
interface RosterEntry {
  id: string;
  class: "agent" | "specialist" | "minion";
  entityCode?: string;
  // ... health fields
}
```

**Proposed generic API for new `CollapsibleSection` component in `components/ui/`:**
```ts
interface CollapsibleSectionItem {
  id: string;
  summary: React.ReactNode;       // compact pill label
  indicators?: React.ReactNode[]; // badge/chip row in collapsed state
  expandedContent: React.ReactNode;
}
```

Props: `items: CollapsibleSectionItem[]`, optional `defaultOpenId?: string`.

---

## Implementation order (suggested)

Easiest-first, highest-value-first:

1. `UnifiedLogsPage.tsx` — 2 tabs, minimal data dependencies, good prototype
2. `AnimationsPage.tsx` — 2 tabs, isolated
3. `FinancingAnalysis.tsx` — 4 tabs, calculators
4. `FundingPredictor.tsx` — 1 tab, likely skip
5. `Help.tsx` — document sections
6. `CompanyBracketMix.tsx` — 4 tabs, ICP config
7. `Analysis.tsx` — 6 tabs, sub-pages
8. `SpecialistPage.tsx` — dynamic tabs, needs care
9. `PropertyMarketResearch.tsx` — 8 tabs, research sections
10. `LbSlides.tsx` — 7 tabs + factory 6 tabs (two separate tab bars on same page)
11. `CompanyAssumptions.tsx` — canonical Form/Editor; preserve per-tab Save + AnalystButton
12. `CompanyResearch.tsx` — nested tabs, highest complexity, last

---

## Verification gates (for each page converted)

- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts` — PASS (must NOT introduce bare `TabsList`/`TabsTrigger` or banned Analyst strings)
- [ ] Excluded pages retain `<CurrentThemeTab>` usage — not converted
- [ ] `components/ui/tabs.tsx` unchanged (read-only per §13)
