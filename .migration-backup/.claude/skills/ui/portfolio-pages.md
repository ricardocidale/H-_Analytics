---
name: portfolio-pages
description: Portfolio-level page specs — Comparison, Timeline, Map, Executive Summary. Use when building or modifying these pages.
theme: light-cream
---

# Portfolio Pages

## Comparison View
Side-by-side comparison of 2-4 properties across all financial metrics.

- **File**: `client/src/pages/ComparisonView.tsx`
- **Route**: `/compare`
- **Layout**: Property selector (multi-select, max 4), synced vertical scroll, sticky headers
- **Rows**: Revenue, GOP, NOI, FCF, IRR, DSCR, Occupancy, ADR
- **Theme**: Light Cream — column headers use teal gradient, alternating `muted/10` stripes, best/worst highlighted

---

## Timeline View
Chronological view of portfolio events — acquisitions, refinances, renovations, milestones.

- **File**: `client/src/pages/TimelineView.tsx`
- **Route**: `/timeline`
- **Layout**: Vertical timeline with center line, events alternate left/right
- **Event Types**: Acquisition (Building2, `accent`), Refinance (RefreshCw, `chart-3`), Renovation (Wrench, `chart-4`), Milestone (Flag, `secondary`)
- **Theme**: Light Cream — timeline line uses `border` token, cards use `card`/`cardBorder`

---

## Map View
Geographic display of portfolio properties.

- **File**: `client/src/pages/MapView.tsx`
- **Route**: `/map`
- **Implementation**: Leaflet (react-leaflet) with OpenStreetMap tiles (free, no API key)
- **Markers**: Sage green pins, click for summary card linking to detail page
- **Color coding**: Green = healthy, Amber = watch, Red = distressed
- **Theme**: Light Cream — rounded map container with `border` token

---

## Executive Summary
Single printable page summarizing portfolio performance for stakeholders.

- **File**: `client/src/pages/ExecutiveSummary.tsx`
- **Route**: `/executive-summary`
- **Layout**: Company header, KPI row (AUM, Revenue, NOI, Occupancy, IRR), pie chart, trend chart, property table, capital structure
- **Theme**: Light Cream (print-friendly) — no glass effects in `@media print`, `accent`/`secondary` chart colors
