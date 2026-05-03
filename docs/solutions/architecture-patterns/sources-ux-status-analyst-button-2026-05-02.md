---
title: "Sources UX: status icon, last-regenerated timestamp, and Analyst button per source"
date: 2026-05-02
category: architecture-patterns
module: admin-sources
problem_type: best_practice
component: frontend_stimulus
severity: high
applies_when:
  - Building or modifying any item under Admin → Sources
  - Adding a new source type (table, research dataset, link group, file collection)
  - Designing the Sources → Tables, Market Research, Comparables, Links, or Files pages
tags: sources, admin-navigation, analyst-button, status-icon, ux, regeneration
---

# Sources UX: status icon, last-regenerated timestamp, and Analyst button per source

## Context

The Admin → Sources section is the single home for all data the app reads from —
structured tables, market research text, comparables, external links, uploaded files.
Admins need to know at a glance whether each source is healthy and up-to-date, and
be able to trigger a refresh with one click. These three affordances are required
on every source item.

## Guidance

Every source row or source group in `Admin → Sources` must show three affordances:

### 1. Status icon (green / red)

- **🟢 Green**: source is reachable AND last refresh completed without errors
- **🔴 Red**: source is unreachable OR last refresh errored OR never refreshed
- Checked at page load; short-interval polling is optional
- Hover tooltip: "Last checked: X ago" + error message detail on red
- While checking: neutral / amber pending state

### 2. Last regenerated timestamp

- Shows when this source was last successfully refreshed by the Analyst
- Format: relative ("2 days ago") with full ISO datetime on hover
- Never refreshed → "Never regenerated" in muted/secondary text color
- Scoped to the specific source, not a global timestamp

### 3. Run Analyst button

- Every source row or group of sources of the same kind has a **[Run Analyst]** button
- Follows the `analyst-research-buttons` skill naming convention exactly
- Clicking triggers the relevant Specialist (or Analyst orchestrator) to regenerate that source
- During run: button shows spinner + "Running…", icon shows amber/pending
- On completion: icon updates to green/red, timestamp updates to "just now"
- On error: icon turns red, error detail shown in tooltip or inline

### Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  🟢  Tax Constants             Last regenerated: 2 days ago   [Run ↻]  │
│  🔴  Macro Indicators          Never regenerated              [Run ↻]  │
│  🟢  Depreciation Schedules    Last regenerated: 5 days ago   [Run ↻]  │
└────────────────────────────────────────────────────────────────────────┘
```

- Status icon: left of the source label
- Timestamp + button: right-aligned in the row
- For a group (e.g. all Tables): a group-level Run button that triggers all in the group
- Individual sources within the group also have their own run button

## Why This Matters

- Admins have no way to know if research data is stale or broken without this
- A green/red icon makes data health scannable at a glance (no need to open each source)
- The Run Analyst button gives admins control over regeneration without CLI access
- Last regenerated timestamp lets admins audit the research pipeline and catch drift

## When to Apply

- Every `Admin → Sources → Tables` sub-item (Benchmarks, Market Data, Tax Constants, etc.)
- `Admin → Sources → Market Research` and its Comparables sub-item
- `Admin → Sources → Links` (status = link reachable/unreachable, not Analyst-dependent)
- `Admin → Sources → Files` (no status icon needed — files are admin-uploaded, not live)

## Examples

**Table group with per-row controls:**
```
Sources → Tables
  🟢  Benchmarks                Last regenerated: 1 day ago     [Run ↻]
  🔴  ADR Index                 Last regenerated: 14 days ago   [Run ↻]
  🟢  Tax Constants             Last regenerated: 3 days ago    [Run ↻]
  🟢  Macro Indicators          Last regenerated: 3 days ago    [Run ↻]
                                                    [Run All Tables ↻]
```

**Market Research with sub-item:**
```
Sources → Market Research
  🟢  Market Research           Last regenerated: 2 days ago    [Run ↻]
    └── 🟢  Comparables         Last regenerated: 2 days ago    [Run ↻]
```

**Links (reachability only, no Analyst button):**
```
Sources → Links
  🟢  FRED API                  Last checked: 5 min ago
  🔴  World Bank Data           Last checked: 5 min ago  ⚠ unreachable
```

## Related

- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — canonical nav tree and all placement rules
- `.agents/skills/analyst-research-buttons/SKILL.md` — button naming convention
- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — source registry routes
