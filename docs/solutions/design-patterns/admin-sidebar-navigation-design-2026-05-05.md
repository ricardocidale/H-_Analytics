---
title: "Admin Sidebar Design — Icon Deduplication, Label Clarity, and Group Merging"
date: 2026-05-05
category: design-patterns
module: admin-sidebar-navigation-structure
problem_type: design_pattern
component: frontend_stimulus
severity: low
applies_when:
  - Auditing or refactoring the AdminSidebar navigation group structure
  - Choosing Phosphor icons to avoid duplication across nav items
  - Renaming ambiguous sidebar labels for clarity
  - Reorganizing sidebar groups such as merging Properties and Scenarios into Portfolio
tags:
  - sidebar
  - navigation
  - phosphor-icons
  - icon-deduplication
  - nav-groups
  - ux-polish
  - admin-ui
---

# Admin Sidebar Design — Icon Deduplication, Label Clarity, and Group Merging

## Context

An audit of the admin sidebar revealed two structural problems affecting usability:

1. **Icon duplication** — six items used the same Phosphor icon across different sections, making items visually indistinguishable when glancing at the collapsed sidebar. Specifically, the icon for "Properties" appeared on both the group header and a sub-item under "Steady State"; the icon for "Scenarios" appeared on both the group header and an "All Scenarios" sub-item; `IconCalculator` was used for both "Constants" and "Reference Ranges" within the same group.

2. **Unclear group labels** — "Steady State" is an internal financial modeling term that does not communicate its purpose to a new admin. The separation of "Properties" and "Scenarios" into two sidebar groups obscures that they describe the same underlying entities (properties contain scenarios).

The audit was conducted against `buildNavGroups()` in `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`, lines 186–263. The app uses `@phosphor-icons/react`.

## Guidance

**Label changes**

| Current label | Recommended label | Rationale |
|---|---|---|
| Steady State | Model Defaults | Describes the section's purpose: admin-controlled default values for the financial model |
| Properties (group) + Scenarios (group) | Portfolio (merged group) | Properties and scenarios describe the same entity from different angles; one group reduces cognitive overhead |

**Icon mapping — no duplicates**

Every sidebar item at the group level should use a semantically distinct Phosphor icon. Recommended mapping:

| Sidebar item | Recommended icon | Notes |
|---|---|---|
| Dashboard | `ChartBar` | Correct if already present |
| Portfolio (merged Properties + Scenarios) | `Buildings` | Portfolio-level icon; communicates "real estate assets" |
| Scenarios (sub-item within Portfolio) | `GitFork` | Communicates branching / alternative analysis |
| Market Rates | `TrendUp` | Communicates live market data direction |
| Model Defaults (was Steady State) | `SlidersHorizontal` | Communicates tunable parameters |
| Capital Raise | `Coin` | Communicates financing / capital |
| Users | `Users` | Semantically correct; keep |
| Settings | `Gear` | Semantically correct; keep |

**Group merge: Properties + Scenarios**

Collapse the two separate groups into one `id: "portfolio"` group:

```typescript
{
  id: "portfolio",
  label: "Portfolio",
  icon: IconBuildings,
  description: "Properties, scenarios, and default assignments",
  sections: [
    { value: "required-fields",      label: "Required Fields",      icon: IconFileCheck },
    { value: "property-heroes",      label: "Property Heroes",      icon: IconImage },
    { value: "scenarios",            label: "All Scenarios",        icon: IconGitFork },
    { value: "default-assignments",  label: "Default Assignments",  icon: IconUserCog },
  ],
},
```

**Group rename: Steady State → Model Defaults**

```typescript
// Before
{
  id: "financial-defaults",
  label: "Steady State",
  icon: IconSliders,
  // ...
}

// After
{
  id: "financial-defaults",
  label: "Model Defaults",
  icon: IconSlidersHorizontal,
  description: "Default values and constants applied to new entities and financial model",
  // sections unchanged
}
```

**Sub-item icon deduplication within Model Defaults**

"Constants" and "Reference Ranges" both use `IconCalculator`. Assign a distinct icon to "Reference Ranges":

| Sub-item | Recommended icon |
|---|---|
| Constants | `IconCalculator` (keep) |
| Reference Ranges | `IconRuler` or `IconArrowsVertical` |

## Why This Matters

The admin sidebar is the primary navigation surface for operators who configure the platform. Icon duplication forces reading every label on every visit — the sidebar's core job of letting admins navigate by glance is undermined. A user scanning a collapsed sidebar with six visually identical icons has no spatial memory to rely on.

Label clarity matters for onboarding. "Steady State" requires prior knowledge of the financial modeling domain. "Model Defaults" communicates function immediately to any new admin, reducing support burden and misconfiguration risk.

Merging Properties and Scenarios into Portfolio reduces the mental model from "two separate concerns" to "one entity with multiple views." This aligns with how the underlying data is structured — a `Property` is the parent; `Scenario` is a child — and prevents the sidebar from implying a false separation.

## When to Apply

- A new admin section is added to the sidebar — check the icon table before assigning an icon, and verify no existing item already uses it
- A section label is reported as confusing during admin onboarding or user testing
- Two sidebar groups are found to describe closely related entities (merge test: would a confused admin click both groups looking for the same thing?)
- The sidebar grows past 8 top-level groups — further merges should be considered before adding new groups

Do not apply to sub-items within a group when the group icon is already distinct — sub-item icon uniqueness is lower priority than group-level uniqueness.

## Examples

**Icon duplication audit — current state (abbreviated):**

```typescript
// buildNavGroups() — current violations
{ id: "financial-defaults", label: "Steady State",  icon: IconSliders,     /* ... */ },
//   sub-item:                label: "Property",      icon: IconProperties   // DUPLICATE ↓
{ id: "properties",          label: "Properties",    icon: IconProperties,  /* ... */ },
//   sub-item:                label: "All Scenarios", icon: IconScenarios    // DUPLICATE ↓
{ id: "scenarios",           label: "Scenarios",     icon: IconScenarios,   /* ... */ },
//   sub-item:                label: "Constants",     icon: IconCalculator   // DUPLICATE ↓
//   sub-item:                label: "Reference Ranges", icon: IconCalculator // WITHIN-GROUP DUPLICATE
```

**Target state — no duplicates, merged Portfolio group:**

```typescript
function buildNavGroups(): NavGroup[] {
  return [
    {
      id: "financial-defaults",
      label: "Model Defaults",                    // renamed from "Steady State"
      icon: IconSlidersHorizontal,                // distinct
      description: "Default values and constants applied to new entities and financial model",
      sections: [
        { value: "defaults-management-company", label: "Management Company", icon: IconBriefcase },
        { value: "defaults-property",           label: "Property",           icon: IconProperties },
        { value: "constants",                   label: "Constants",          icon: IconCalculator },
        { value: "analyst-tables",              label: "Analyst Tables",     icon: IconBrain },
        { value: "reference-ranges",            label: "Reference Ranges",   icon: IconRuler },    // changed
      ],
    },
    {
      id: "portfolio",                            // merged from "properties" + "scenarios"
      label: "Portfolio",
      icon: IconBuildings,                        // distinct from sub-items
      description: "Properties, scenarios, and default assignments",
      sections: [
        { value: "required-fields",      label: "Required Fields",      icon: IconFileCheck },
        { value: "property-heroes",      label: "Property Heroes",      icon: IconImage },
        { value: "scenarios",            label: "All Scenarios",        icon: IconGitFork },    // distinct
        { value: "default-assignments",  label: "Default Assignments",  icon: IconUserCog },
      ],
    },
    // ... remaining groups unchanged
  ];
}
```

## Related

- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — Companion: placement rules for Sources and Resources sections in the same sidebar
- `docs/solutions/architecture-patterns/no-duplicate-menu-items-hierarchical-nav-2026-05-02.md` — Companion: rule against placing the same destination in two nav sections (group-merge corollary)
