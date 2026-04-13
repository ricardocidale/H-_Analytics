# New Features Backlog

**Version**: 1.0
**Date**: 2026-03-16
**Planned by**: Claude Code Opus 4.6 (Anthropic)
**Status**: Backlog — not yet assigned to Replit. Discuss with owner before prioritizing.

---

## For Replit Agent

These are features that **do not exist today** in the codebase. They require new components, new logic, or new data flows. None of these have been requested for implementation yet. They emerged from the UX audit as opportunities.

**Do not build any of these unless the project owner explicitly asks for it.**

This document exists so good ideas don't get lost. The owner will decide what matters, in what order.

---

## How This Differs from the Other Documents

| Document | What It Covers |
|----------|---------------|
| `UX-REDESIGN-PLAN.md` | Reorganizing defaults & settings (approved, in progress) |
| `APP-UX-ROADMAP.md` | Optimizing existing features (surface, connect, clarify) |
| `MARCELA-ISOLATION.md` / `RESTORATION.md` | Disabling/re-enabling Marcela |
| **This document** | Brand new functionality that doesn't exist yet |

---

# Dashboard & Portfolio

### 1. Dashboard Alert Strip
**What:** A warning bar below KPI cards showing critical issues: DSCR < 1.25x, negative cash flow, company cash shortfall. Clickable to navigate to the source.

**Why it doesn't exist:** Dashboard shows consolidated health but never flags problems. User must discover issues by drilling into each property.

**What it needs:** New component. Logic to scan all property financials for threshold breaches. Threshold values configurable in admin (ties into existing notification alert rules engine).

---

### 2. Portfolio Sort & Filter
**What:** Dropdown to sort property cards by Revenue, NOI, IRR, Room Count, Status. Filter chips by Status (Operating/Pipeline) and Market.

**Why it doesn't exist:** Properties are hardcoded to acquisition date order.

**What it needs:** Sort/filter UI on Portfolio page. Data already computed by `usePortfolioFinancials` — just needs array sort and filter before render.

---

### 3. Clone Property
**What:** "Clone" action on property card that duplicates all assumptions into a new property with "(Copy)" suffix.

**Why it doesn't exist:** To model a similar property, user creates from scratch.

**What it needs:** Server endpoint to deep-copy a property row (including fee categories). Client menu item.

---

# Property Experience

### 4. Monthly View Toggle
**What:** Toggle on Property Detail tabs: "Annual | Monthly". Monthly shows 120-month projection with horizontal scroll, collapsible to quarterly.

**Why it doesn't exist:** All financial tables show annual data only. Monthly data is computed by the engine but aggregated to yearly before display.

**What it needs:** New table rendering mode. The engine already returns monthly data (`MonthlyFinancials[]`) — it's aggregated in the tab components. This un-aggregates it.

---

### 5. Quick Sensitivity Panel
**What:** 3-4 sliders on Property Detail (ADR, Occupancy, Exit Cap Rate, Interest Rate) that temporarily adjust displayed financials without saving. "Try it" mode.

**Why it doesn't exist:** To test a change, user must edit, save, and return. No quick experimentation.

**What it needs:** New panel component. Re-runs the property engine with modified inputs on slider change. Displays "adjusted" vs "base" side-by-side. Does not persist until user clicks "Save these changes."

---

### 6. Property Comparison from Detail
**What:** "Compare with..." button on Property Detail that opens the existing Compare view (`/analysis` Compare tab) pre-loaded with this property selected.

**Why it doesn't exist:** Compare view exists but user must navigate to Analysis and manually select properties.

**What it needs:** Navigation with query params (e.g., `/analysis?tab=compare&property=5`). Compare tab reads params on mount.

---

### 7. Field Validation Hints
**What:** When a property assumption is outside typical range, show an amber hint: "Operating cost rate of 45% is above typical range (15-30%)."

**Why it doesn't exist:** No client-side validation against benchmarks. Research badges show ranges but don't warn on save.

**What it needs:** Validation rules per field (min/max typical range). Could use the existing research `GENERIC_DEFAULTS` ranges. Warning component next to input fields. Non-blocking — hints, not errors.

---

# Research

### 8. Research Provenance Tracking
**What:** On Property Edit, each field shows whether its value came from: user entry, research application, or unchanged default. Tooltip: "Applied from research on Mar 15."

**Why it doesn't exist:** Property saves the final value but not where it came from.

**What it needs:** Extend `property.researchValues` JSONB with `appliedAt` timestamps per field. Track in `ApplyResearchDialog` when values are applied. Display as subtle icon/tooltip on Property Edit.

---

### 9. Admin Research Prompt Preview
**What:** "Preview Prompt" button in Research Center admin that shows the assembled system + user prompt for a sample property before any research is generated.

**Why it doesn't exist:** Admin configures focus areas, instructions, tools — but can't see the result until generation runs.

**What it needs:** Server endpoint that builds the prompt (using existing `research-prompt-builders.ts`) but returns it as text instead of sending to LLM. Client renders in a read-only dialog.

---

### 10. Bulk Generation Progress Detail
**What:** During "Generate Missing Research" on Research Hub, show a per-entity progress list with name, status (waiting/generating/complete/failed), elapsed time, and per-item retry.

**Why it doesn't exist:** Current bulk generation shows a single progress bar ("Generating 3 of 7") without entity names or retry.

**What it needs:** Extend the bulk generation loop in ResearchHub to track per-entity state. New progress list component replacing the single progress bar.

---

# Analysis & Scenarios

### 11. Pre-Built Sensitivity Scenarios
**What:** "Conservative", "Base Case", "Aggressive" buttons on Sensitivity Analysis that set all sliders to predefined positions with one click.

**Why it doesn't exist:** User must manually position each slider.

**What it needs:** Three preset objects defining slider values. Buttons that apply them. Reset button already exists.

---

### 12. Goal Seek / Reverse Solve
**What:** "What ADR growth rate achieves a 15% IRR?" — user sets a target metric and the system reverse-solves for the input variable.

**Why it doesn't exist:** All analysis is forward (inputs → outputs). No backward solving.

**What it needs:** Binary search or Newton's method solver that iterates the engine. New UI for target metric selection and input variable selection. Could use existing deterministic tools as building blocks.

---

### 13. Scenario Impact Quantification
**What:** When comparing two scenarios, show not just the diff but the financial impact: "Occupancy -5% → IRR drops from 14.2% to 11.8% (-2.4pp)"

**Why it doesn't exist:** Scenario compare shows assumption diffs but doesn't run both through the engine to quantify impact.

**What it needs:** Run both scenario snapshots through `generatePropertyProForma`, compute deltas on key metrics. Display in the existing compare dialog.

---

### 14. Scenario Tags & Search
**What:** Tag scenarios (e.g., "conservative", "lender package", "Q1 review") and search/filter the scenario list.

**Why it doesn't exist:** Scenarios have name and description only. No tags or search.

**What it needs:** Tags field on scenario schema. Tag input component. Filter/search on Scenarios page.

---

# Company

### 15. Staffing Tier Breakdown
**What:** On Company Income Statement, make "Staff Costs" an expandable row showing: tier applied, FTE count, salary per FTE, total per tier.

**Why it doesn't exist:** Staff costs show as a single line item. Tier logic runs inside the engine but detail isn't surfaced.

**What it needs:** Company engine returns staffing detail breakdown. Income statement tab renders expandable sub-rows (same pattern as property income statement).

---

# Property Finder

### 16. "Add to Portfolio" from Favorites
**What:** Button on Property Finder favorite cards that opens AddPropertyDialog pre-filled with the favorite's data (name, location, price, rooms).

**Why it doesn't exist:** User must manually re-enter details to create a portfolio property from a favorite.

**What it needs:** Pass favorite data to AddPropertyDialog as initial values. Dialog already accepts default form data.

---

# Map View

### 17. Performance Heatmap Modes
**What:** Dropdown to switch map marker coloring: DSCR (current default), ADR, Occupancy, Revenue, NOI Margin.

**Why it doesn't exist:** Map currently only colors by DSCR tiers (green/yellow/red).

**What it needs:** Per-property metric data passed to map markers. Color scale per metric. Legend updates. Data already available from `usePortfolioFinancials`.

---

# Exports

### 18. Bulk Export All Properties
**What:** "Export All Properties" on Portfolio page. Generates a single Excel workbook with one sheet per property plus a consolidated sheet.

**Why it doesn't exist:** Exporting requires visiting each property individually.

**What it needs:** Server or client-side generation of multi-sheet workbook. The per-property export logic already exists in `excelExport.ts` — needs a loop + consolidation sheet.

---

# Help

### 19. Help Search
**What:** Search bar at top of Help page with full-text search across all 17 user manual sections.

**Why it doesn't exist:** User must browse sections manually.

**What it needs:** Client-side text search over section content. Highlight matches. Filter visible sections.

---

### 20. Financial Glossary Tab
**What:** Dedicated "Glossary" tab on Help page with ~50 terms: definition, formula, where to find in app. Terms: GOP, NOI, DSCR, IRR, IBFC, ANOI, FCFE, FF&E, USALI, RevPAR, ADR, LTV, Cap Rate, etc.

**Why it doesn't exist:** Terms are used on every financial page but never defined in-app.

**What it needs:** New tab on Help page. Static content (definitions + formulas). Alphabetical list with search. Could also power the tooltip system (item 7.1 in APP-UX-ROADMAP.md).

---

# Notifications

### 21. Default Alert Rules
**What:** Ship with 3 pre-configured alert rules that admins can customize:
1. DSCR < 1.25x on any property → warning
2. Company cash runway < 6 months → warning
3. Research older than 30 days → info

**Why it doesn't exist:** Alert rules engine exists (admin can create rules) but no rules ship by default. Most users never configure them.

**What it needs:** Seed script to create 3 default alert rules on first deployment. Uses existing `NotificationStorage` and alert engine.

---

# User Experience

### 22. Undo / Revert on Property Edit
**What:** "Revert to last saved" button on Property Edit that restores all fields to their last-persisted values. Undoes all unsaved changes.

**Why it doesn't exist:** If user accidentally changes a value, they must remember the old value or load a scenario.

**What it needs:** Track `lastSavedData` in component state (snapshot on page load). "Revert" button resets `formData` to snapshot. No server change needed.

---

### 23. Context-Sensitive Help Links
**What:** Small (?) icon on each page header that links directly to the relevant Help section. Property Detail → Help > Property Details section. Company → Help > Management Company section.

**Why it doesn't exist:** Help page exists but there's no link from each page to its documentation.

**What it needs:** Mapping of route → help section anchor. (?) icon component in PageHeader. Help page sections with anchor IDs.

---

# Summary

| # | Feature | Effort | Category |
|---|---------|--------|----------|
| 1 | Dashboard alert strip | Medium | Dashboard |
| 2 | Portfolio sort & filter | Small | Portfolio |
| 3 | Clone property | Small | Portfolio |
| 4 | Monthly view toggle | Large | Property |
| 5 | Quick sensitivity panel | Large | Property |
| 6 | Compare from Property Detail | Small | Property |
| 7 | Field validation hints | Medium | Property |
| 8 | Research provenance tracking | Medium | Research |
| 9 | Admin research prompt preview | Medium | Research |
| 10 | Bulk generation progress detail | Medium | Research |
| 11 | Pre-built sensitivity scenarios | Small | Analysis |
| 12 | Goal seek / reverse solve | Large | Analysis |
| 13 | Scenario impact quantification | Medium | Scenarios |
| 14 | Scenario tags & search | Small | Scenarios |
| 15 | Staffing tier breakdown | Medium | Company |
| 16 | Add to Portfolio from Favorites | Small | Property Finder |
| 17 | Map performance heatmap modes | Medium | Map |
| 18 | Bulk export all properties | Medium | Exports |
| 19 | Help search | Small | Help |
| 20 | Financial glossary tab | Medium | Help |
| 21 | Default alert rules | Small | Notifications |
| 22 | Undo/revert on Property Edit | Small | UX |
| 23 | Context-sensitive help links | Small | UX |
| 24 | Premium PDF via HTML-to-PDF | Medium | Exports |

**Small** = < 1 day. **Medium** = 1-3 days. **Large** = 3+ days.

---

### 24. Premium PDF Export via HTML-to-PDF
**What:** Replace jsPDF + autotable PDF generation with HTML-to-PDF rendering (Puppeteer, Playwright, or @react-pdf/renderer). PDFs would look like the app — branded, styled, with real charts.

**Why it doesn't exist:** Current PDFs use jsPDF which produces functional but plain table-based output. The "premium" path tries Anthropic Agent Skills (beta) but falls back to the same jsPDF renderer. Charts are drawn with primitive line commands.

**Options:**
- **Puppeteer/Playwright** — render styled HTML to PDF via headless Chromium. Pixel-perfect. Needs Chromium binary (~300MB).
- **@react-pdf/renderer** — React components render directly to PDF. Lightweight. Custom styling but not identical to app.
- **Improve existing jsPDF** — better templates, chart PNGs embedded. Lowest effort, limited ceiling.

**What it needs:** New PDF template components (HTML or React-PDF), chart rendering pipeline, branded header/footer, company logo embedding. Remove dependency on Anthropic Agent Skills beta for PDF generation.

---

*None of these are approved for implementation. This is a backlog for discussion with the project owner. Items may be reprioritized, modified, or rejected based on business needs.*
