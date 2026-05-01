# Chapter 14: Adding, Editing, and Deleting Properties

## Overview

Properties (SPVs) are the fundamental investment entities in the portfolio. The platform supports full create, read, update, and delete operations on properties, with each change triggering immediate recalculation of all consolidated financials, Management Company fee revenue, and portfolio-level metrics.

---

## Adding a Property

To add a property, navigate to the Portfolio page, click "Add Property" to open the dialog, fill in the required fields, and save. The property is created in the database and immediately appears in the portfolio.

### Required Fields for New Property

| Section | Field | Default | Notes |
|---------|-------|---------|-------|
| **Identity** | Name | — | Descriptive property name |
| | Location | — | City/region (e.g., "Asheville, NC") |
| | Market | — | Market classification (e.g., "Southeast US") |
| | Status | Development | Development, Acquisition, or Operating |
| | Image URL | — | Optional; property card thumbnail |
| **Timing** | Acquisition Date | — | Date of property purchase |
| | Operations Start Date | Acquisition + 6 months | Auto-calculated; user-overridable |
| **Capital Structure** | Purchase Price | — | Total acquisition cost |
| | Building Improvements | $0 | Renovation / repositioning CapEx |
| | Pre-Opening Costs | $0 | Soft costs before operations commence |
| | Operating Reserve | $0 | Working capital cushion |
| | Type | Full Equity | "Full Equity" (all-cash) or "Financed" |
| **Revenue Drivers** | Room Count | 20 | Number of keys |
| | Start ADR | $350 | Average Daily Rate at launch |
| | ADR Growth Rate | 3% | Annual ADR escalation |
| | Start Occupancy | 55% | Opening occupancy rate |
| | Max Occupancy | 85% | Stabilized occupancy target |
| | Occupancy Ramp Months | 6 | Months between occupancy growth steps |
| | Catering Boost % | 22% | F&B revenue uplift from catering programs |

For the full assumption catalog and how each assumption feeds into the financial engine, see Chapter 5: Property-Level Assumptions.

---

## Editing a Property

To edit a property, navigate to the Portfolio page and click the edit icon on the property card. This opens the Property Edit page, where all configurable fields are organized in collapsible sections.

### Property Edit Page Sections

| Section | Fields Included |
|---------|----------------|
| Property Identity | Name, location, market, status, image |
| Acquisition & Timing | Purchase price, acquisition date, operations start date |
| Capital Improvements | Building improvements, pre-opening costs, operating reserve, land value percentage |
| Revenue Assumptions | Room count, start ADR, ADR growth rate, start/max occupancy, occupancy ramp months, catering boost percentage |
| Revenue Shares | Event revenue share, F&B revenue share, other revenue share (as percentage of room revenue) |
| Operating Cost Rates | Rooms, F&B, admin, marketing, property ops, utilities, insurance, taxes, IT, FF&E, other (each as percentage of total revenue) |
| Financing | Acquisition type (Full Equity / Financed), LTV, interest rate, term, closing cost rate |
| Refinancing | Will refinance (Yes/No), refinance date, refi LTV, refi interest rate, refi term, refi closing cost rate |
| Exit | Exit cap rate, tax rate |

Where AI market research data exists, recommended ranges appear inline next to applicable fields.

---

## Deleting a Property

To delete a property, navigate to the Portfolio page, click the delete icon on the property card, and confirm deletion in the confirmation dialog. The property is permanently removed.

### Cascading Effects of Deletion

| Impact Area | Effect |
|-------------|--------|
| Portfolio totals | Consolidated financials immediately exclude the deleted property |
| Management Company revenue | Fee revenue from the deleted property drops to zero; the Management Company P&L recalculates |
| Dashboard KPIs | All portfolio metrics update to reflect the reduced property count |
| Investment analysis | IRR, equity multiple, and FCF recalculate without the deleted property |
| Scenarios | Saved scenarios retain their snapshot; only the active working state is affected |

---

## Property Images

Properties support visual assets for display on property cards and detail pages. Images can be provided via an external URL, uploaded directly through the image upload interface, or generated using the AI image generation feature. Images appear on the Portfolio page property cards (as thumbnails), the Property Detail page (as a hero image), the Property Edit page, and in exported reports where supported.

---

## Recalculation Behavior

Adding, editing, or removing properties triggers an immediate, full recalculation of all downstream financials. This recalculation is client-side and instantaneous — there is no batch processing or queue.

| Trigger | Recalculation Scope |
|---------|-------------------|
| Add property | New property's pro forma is generated; consolidated totals include the new entity; Management Company fee revenue increases |
| Edit property assumptions | That property's pro forma regenerates; consolidated totals and Management Company revenue update accordingly |
| Delete property | Property excluded from all aggregations; Management Company fee revenue decreases; portfolio metrics contract |

---

## Verification Notes for Checkers

| Check | What to Verify |
|-------|---------------|
| Add → recalculate | Add a new property → confirm Dashboard KPIs, consolidated statements, and Management Company fees all reflect the addition |
| Edit → recalculate | Change a single assumption (e.g., ADR) on one property → confirm only that property's financials change; consolidated totals update by the correct delta |
| Delete → recalculate | Remove a property → confirm its revenue and expenses are fully excluded from all consolidated views |
| Fee linkage | Property management fee expense must equal the Management Company's fee revenue from that property (to the penny) |
| Image persistence | Upload an image → save → reload page → confirm the image displays correctly |
| Default values | Add a property with minimal inputs → confirm all default assumptions are correctly applied |
