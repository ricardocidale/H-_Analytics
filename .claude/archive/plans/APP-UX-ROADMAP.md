# App-Wide UX Optimization Roadmap

**Version**: 2.0 (revised — organize & optimize, no new features)
**Date**: 2026-03-16
**Planned by**: Claude Code Opus 4.6 (Anthropic)
**Companion to**: `UX-REDESIGN-PLAN.md` (defaults governance)

---

## For Replit Agent

This is NOT a feature roadmap. Every item below uses **existing functionality** that already works. The goal is to reorganize, surface, connect, and clarify what's already built so users can actually find and use it.

---

## Guiding Principle

The app has ~38 routes, 15 admin tabs, a research system, scenario management, 6 export formats, sensitivity analysis, financing tools, a chatbot, a map, a property finder, and more. The problem isn't missing features — it's that **users can't find what they need when they need it**.

Every recommendation below either:
- **Moves** something to where users expect it
- **Surfaces** something that's buried
- **Connects** two things that should link to each other
- **Explains** something that's confusing
- **Removes** clutter that distracts

---

# 1. Research System — Organize the Workflow

The research system generates AI market analysis and feeds benchmarks into property assumptions. All the pieces exist. They're just disconnected.

## 1.1 Connect Research Results to Property Edit

**What exists:** Research badges on Property Edit fields. Apply Research Dialog. Research pages with full analysis.

**What's broken:** A user generates research on `/property/:id/research`, then navigates to `/property/:id/edit` and doesn't realize the badges updated. There's no prompt to review.

**Fix:** After research completes, when the user next visits Property Edit, show a **one-line banner** at the top: "New research available — {N} fields have updated recommendations. [Review & Apply]". This uses the existing `ApplyResearchDialog` — just surfaces the trigger.

## 1.2 Surface Research Freshness Where It Matters

**What exists:** `ResearchFreshnessBadge` component (green/amber/red dot). Research Hub with status per entity.

**What's broken:** Freshness is only visible on the research page itself. A user on Property Detail or Dashboard has no idea research is stale.

**Fix:** Show the freshness badge on:
- Property Detail header (next to property name) — already has space for badges
- Portfolio property cards — small dot in the corner
- Dashboard overview — count of stale/missing research as a stat

All these components already exist. Just render `ResearchFreshnessBadge` in additional locations.

## 1.3 Clarify Research Purpose on First Visit

**What exists:** Empty state on PropertyMarketResearch page with "No Market Research Yet" and three info cards.

**What's broken:** The empty state explains what research contains but not **why the user should care** or **how to use the results**.

**Fix:** Update the empty state copy to: "Generate market benchmarks for this property. Results appear as recommendation badges on the Edit Assumptions page, helping you set realistic ADR, occupancy, and cost rates. Takes about 30 seconds."

Text change only. No new components.

## 1.4 Make Research Hub the Central Status Page

**What exists:** Research Hub page with status cards per entity, bulk generation button, progress tracking.

**What's broken:** Research Hub isn't in the main sidebar. It's accessible via `/research` redirect or through Company Research links. Users don't know it exists.

**Fix:** The Research Hub should be accessible from a clear sidebar location. Either:
- Add it under the existing "Management Company" group (it's research FOR the portfolio)
- Or make it discoverable from Dashboard (a "Research Status" link in the overview)

The page and route exist. Just needs a navigation entry point.

---

# 2. Dashboard — Surface What's Already Computed

## 2.1 Link KPI Cards to Their Source

**What exists:** 8 KPI cards on Dashboard overview (Revenue, GOP, Properties, Fees, IRR, Equity Multiple, Cash-on-Cash, Exit Value). All computed by the portfolio aggregation hook.

**What's broken:** Cards are display-only. User sees "IRR: 12.4%" but can't click to understand it.

**Fix:** Make each card clickable — navigates to the relevant tab on the same Dashboard page:
- Revenue → Income Statement tab
- IRR, Equity Multiple, Cash-on-Cash → Investment Analysis tab
- Active Properties → (scroll to portfolio breakdown section)

No new pages. Just `onClick` handlers linking to existing tabs.

## 2.2 Show Per-Property Performance in Overview

**What exists:** `usePortfolioFinancials` hook computes per-property yearly financials, IRR, equity multiple. This data is already available in the Dashboard component.

**What's broken:** The overview tab shows consolidated totals but doesn't show which property is strong or weak. User must click into each property individually.

**Fix:** Add a **sortable mini-table** to the overview tab below the charts — using the data already computed:

| Property | Year 1 Revenue | Year 1 NOI | IRR | Status |
|----------|---------------|------------|-----|--------|

Use the existing `FinancialTable` or a simple HTML table. Data is already in `allPropertyYearlyIS`. Sortable via existing table sort patterns. Click row → navigate to `/property/:id`.

---

# 3. Portfolio — Better Property Cards

## 3.1 Show Key Metrics on Cards

**What exists:** Property cards show photo, name, location, purchase price, room count.

**What's broken:** The metrics users care about (Revenue, NOI, IRR) are computed by the engine but not shown on the card. User has to click into each property to compare.

**Fix:** Add 2-3 small metric badges to each `PortfolioPropertyCard`:
- Year 1 NOI (already in `allPropertyYearlyIS`)
- IRR (already computed)
- Status badge color already exists

The data is available via `usePortfolioFinancials`. Pass it to the card component.

## 3.2 Add Sort Options

**What exists:** Properties sorted by acquisition date (hardcoded in Portfolio.tsx).

**What's broken:** With 5+ properties, user can't find the best/worst performer without clicking each one.

**Fix:** Add a sort dropdown: "Sort by: Acquisition Date | Revenue | NOI | IRR | Room Count". The data for all these is already available. Just sort the array before rendering.

---

# 4. Property Detail — Connect the Pieces

## 4.1 Link to Research from Property Detail

**What exists:** Property Detail page (6 tabs). Property Research page (separate route). Both exist for every property.

**What's broken:** There's no link from Property Detail to Research. User must know to navigate to `/property/:id/research` separately.

**Fix:** Add a "Market Research" link/button in the Property Detail header (next to "Edit Assumptions"). Same pattern as the existing "Edit Assumptions" button. Links to `/property/:id/research`.

## 4.2 Link to Financing Analysis from Cash Flow

**What exists:** Property Detail Cash Flow tab shows debt service, DSCR. Financing Analysis page (`/analysis` > Financing tab) has DSCR sizing, stress testing, prepayment analysis.

**What's broken:** User sees DSCR on the property page but doesn't know there's a whole analysis tool for it.

**Fix:** Below the DSCR row in the Cash Flow table, add a small link: "Explore financing scenarios →" linking to `/analysis` with the Financing tab active. Text link only.

## 4.3 Link to Edit from Financial Tables

**What exists:** Income Statement shows values derived from assumptions. Property Edit page lets you change those assumptions.

**What's broken:** User sees a number they want to change but has to navigate away to find the edit page.

**Fix:** The "Edit Assumptions" button already exists in the header. Make sure it's prominent and always visible (not hidden on scroll). Consider pinning it to the tab bar `rightContent` slot alongside the export menu.

---

# 5. Company Page — Explain What's Happening

## 5.1 Explain Zero Revenue

**What exists:** Company page shows Income tab. Funding gate logic prevents revenue before SAFE funding date. When triggered, revenue shows $0.

**What's broken:** User sees $0 revenue and doesn't know why. The funding gate is invisible.

**Fix:** When company revenue is $0 in the current period, show an **inline info message** above the income statement: "Revenue starts after both the operations start date ({date}) and first funding tranche ({date}) are received. [Edit in Admin > Model Defaults]"

The dates are already in `globalAssumptions`. Just a conditional render.

## 5.2 Explain Intercompany Fees

**What exists:** Company revenue = sum of management fees from all properties. Properties show those fees as expenses. This is correct GAAP.

**What's broken:** User doesn't understand that company revenue and property management fees are the same money. No visual link.

**Fix:** On the Company Income tab, add a small annotation next to "Base Management Fee Revenue": "Sum of base fees across {N} properties". Same for incentive fees. These totals are already computed. Just add a subtitle.

---

# 6. Analysis — Better Entry Points

## 6.1 Make Analysis Tabs Discoverable

**What exists:** 5 analysis tabs: Sensitivity, Compare, Timeline, Financing, Capital Raise. All functional.

**What's broken:** The Analysis page is a hub with tabs, but users don't know what each tab does until they click it.

**Fix:** On first visit to Analysis (or when no analysis has been run), show a **tab description card** for each:
- Sensitivity: "Test how changes in occupancy, ADR, and costs affect your returns"
- Compare: "Side-by-side comparison of up to 4 properties"
- Timeline: "Visual timeline of acquisitions and operations start dates"
- Financing: "DSCR sizing, debt yield analysis, and stress testing"
- Capital Raise: "Cash runway projection and funding strategy"

Show descriptions below the tab bar or as tooltips on tab hover. Text only.

---

# 7. Help & Education — Use What's Already Written

## 7.1 Link Financial Terms to Help Glossary

**What exists:** Help page with 17-section User Manual. Financial statements use terms like GOP, NOI, DSCR, IBFC, ANOI, FCFE.

**What's broken:** Users encounter these terms on every page but don't know what they mean. The Help page has explanations but there's no connection between the term and the documentation.

**Fix:** On financial table headers (Income Statement, Cash Flow, Balance Sheet), make acronyms/terms into **tooltip-on-hover** that shows a one-line definition. The definitions can come from the existing User Manual content or the Checker Manual glossary section.

Example: Hover over "GOP" → "Gross Operating Profit: Total Revenue minus Departmental Expenses"

This is a UI component change (tooltip on table header cells), not new content.

## 7.2 Surface the Guided Tour

**What exists:** Guided Tour on Help page. Interactive walkthrough of app features. Tour prompt toggleable via admin settings.

**What's broken:** Tour is buried in Help > Guided Tour tab. New users may never find it.

**Fix:** If the user has never completed the tour (track via localStorage or user profile), show a subtle **"Take a Tour"** button in the sidebar footer. Clicking launches the existing walkthrough. Dismissing sets the flag. The tour component already exists.

---

# 8. Navigation & Discoverability

## 8.1 Consistent "Edit" Entry Points

**What exists:** Property Edit accessible from Portfolio card ("Assumptions" button) and Property Detail header ("Edit Assumptions" button).

**What's broken:** Two different button labels ("Assumptions" vs "Edit Assumptions") for the same action. Some users miss the path entirely.

**Fix:** Standardize to "Edit Assumptions" everywhere. Button text change only.

## 8.2 Breadcrumb Consistency

**What exists:** Breadcrumbs component in header. Shows current location.

**What's broken:** Breadcrumbs are sometimes truncated or missing intermediate steps. "Dashboard > Hotel Loch Sheldrake" skips "Portfolio".

**Fix:** Ensure breadcrumbs always show the full path: "Dashboard > Portfolio > Hotel Loch Sheldrake > Income Statement". Each segment clickable. Review `Breadcrumbs.tsx` for completeness.

## 8.3 ICP Label Clarity

**What exists:** ICP Definition page under Company. "ICP" stands for Ideal Customer Profile — industry term for target property characteristics.

**What's broken:** Non-hospitality users don't know what "ICP" means.

**Fix:** Rename sidebar label from "ICP Definition" to "Target Property Profile" or "Acquisition Criteria". Same page, same functionality, clearer label.

---

# 9. Rebecca Chatbot — Set Expectations

## 9.1 Introduction Message

**What exists:** Rebecca chatbot (Gemini-powered). Can answer questions about portfolio data, financial metrics, and hospitality industry.

**What's broken:** Users don't know what Rebecca can do. They try to ask it to create properties or change values and get confused.

**Fix:** On first message (or when conversation is empty), Rebecca shows a **system introduction**:
```
I'm Rebecca, your portfolio analytics assistant. I can help you:
• Understand financial metrics and projections
• Compare properties and summarize performance
• Explain assumptions and methodology

For creating or editing data, use the app directly.
```

This is a change to the system prompt or initial message rendering. Rebecca already has a configurable system prompt in admin.

---

# Priority Summary

All items below use existing functionality. No new features. Sorted by impact on user comprehension.

| # | Item | What It Is | Effort |
|---|------|-----------|--------|
| 1.1 | Research → Property Edit banner | Surface existing Apply Research dialog | Small |
| 1.3 | Research empty state copy update | Clarify purpose in existing text | Tiny |
| 5.1 | Company $0 revenue explanation | Conditional info message | Small |
| 7.1 | Financial term tooltips | Hover definitions on table headers | Medium |
| 2.1 | Clickable KPI cards | onClick → existing tab navigation | Small |
| 4.1 | Research link on Property Detail | Button linking to existing page | Tiny |
| 8.3 | ICP label rename | Sidebar text change | Tiny |
| 9.1 | Rebecca introduction message | System prompt update | Tiny |
| 1.2 | Research freshness in more locations | Render existing badge component | Small |
| 2.2 | Property scorecard on Dashboard | Mini-table from existing data | Medium |
| 3.1 | Key metrics on Portfolio cards | Show IRR/NOI from existing hook | Small |
| 3.2 | Portfolio sort dropdown | Sort existing array | Small |
| 4.2 | Financing link from Cash Flow | Text link to existing page | Tiny |
| 4.3 | Pin "Edit Assumptions" button | Move existing button to tab bar | Tiny |
| 5.2 | Intercompany fee annotation | Subtitle text on existing row | Tiny |
| 6.1 | Analysis tab descriptions | Tooltip or description text | Small |
| 7.2 | Surface guided tour | Button in sidebar for existing tour | Small |
| 8.1 | Standardize "Edit Assumptions" label | Button text consistency | Tiny |
| 8.2 | Breadcrumb completeness | Review and fix path gaps | Small |
| 1.4 | Research Hub navigation entry | Add sidebar link to existing page | Tiny |

**Tiny** = text/label change, < 30 minutes
**Small** = render existing component in new location or add onClick, < 2 hours
**Medium** = compose existing data into new view (table, tooltips), < 1 day

---

*Every item uses existing components, data, and pages. Nothing new to build — just reorganize, surface, connect, and clarify.*
