# Admin Sidebar Nav Redesign — Paste for Replit

> **Status: Completed (2026-05-06).** This patch was executed. The implementation
> used `IconSliders` (for Model Defaults group), `IconProperties` (for Portfolio
> group), and `IconGitFork` (for All Scenarios sub-item) — the Phosphor icon
> aliases available in the portal's icon registry — rather than `IconSettings2`,
> `IconBuilding2`, and `IconGitCompareArrows` referenced in the patch below.
> The patch sections below are preserved for historical context only.

Two targeted replacements in:
`artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`

---

## CHANGE 1 of 2 — Replace the icon import block (lines 19–28)

**Find this (exact block):**

```typescript
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconMenu, IconHelpCircle, IconPeople, IconUserCog, IconActivity, IconSwatchBook,
  IconPanelLeft, IconProperties,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconBot, IconBrain, IconFileCheck, IconDatabase, IconShield, IconSettingsGear, IconSliders,
  IconBriefcase, IconPhone, IconScenarios, IconPalette,
  IconShieldCheck,
  IconCalculator, IconDashboard, IconImage,
} from "@/components/icons";
```

**Replace with (what actually landed):**

```typescript
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconMenu, IconHelpCircle, IconPeople, IconUserCog, IconActivity, IconSwatchBook,
  IconPanelLeft, IconProperties,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconBot, IconBrain, IconFileCheck, IconDatabase, IconShield, IconSettingsGear, IconSliders,
  IconBriefcase, IconPhone, IconPalette,
  IconShieldCheck,
  IconCalculator, IconDashboard, IconImage, IconRuler, IconGitFork,
} from "@/components/icons";
```

**What changed:**
- Removed `IconScenarios` (was used for both group header and sub-item — both replaced)
- Kept `IconSliders` (retained as the "Model Defaults" group header icon)
- Added `IconGitFork` (new "All Scenarios" sub-item — Phosphor alias available in the icon registry)
- Added `IconRuler` (new "Reference Ranges" sub-item — de-duplicates from `IconCalculator`)
- Note: `IconSettings2`, `IconBuilding2`, `IconGitCompareArrows` were originally planned but are not in the portal's icon registry; the above Phosphor aliases were used instead.

---

## CHANGE 2 of 2 — Replace `buildNavGroups()` (lines 186–263)

**Find this (exact function):**

```typescript
function buildNavGroups(): NavGroup[] {
  return [
    {
      id: "financial-defaults",
      label: "Steady State",
      icon: IconSliders,
      description: "Defaults applied to new entities, model constants, and research LLM config",
      sections: [
        { value: "defaults-management-company", label: "Management Company", icon: IconBriefcase },
        { value: "defaults-property",           label: "Property",           icon: IconProperties },
        { value: "constants",                   label: "Constants",          icon: IconCalculator },
        { value: "analyst-tables",              label: "Analyst Tables",     icon: IconBrain },
        { value: "reference-ranges",            label: "Reference Ranges",   icon: IconCalculator },
      ],
    },
    {
      id: "properties",
      label: "Properties",
      icon: IconProperties,
      description: "Property-wide admin surfaces",
      sections: [
        { value: "required-fields",  label: "Required Fields",  icon: IconFileCheck },
        { value: "property-heroes",  label: "Property Heroes",  icon: IconImage },
      ],
    },
    {
      id: "users",
      label: "Users",
      icon: IconPeople,
      description: "Manage user accounts and assignments",
      sections: [
        { value: "users", label: "All Users", icon: IconPeople },
      ],
    },
    {
      id: "scenarios",
      label: "Scenarios",
      icon: IconScenarios,
      description: "Scenario management and assignments",
      sections: [
        { value: "scenarios",           label: "All Scenarios",       icon: IconScenarios },
        { value: "default-assignments", label: "Default Assignments", icon: IconUserCog },
      ],
    },
    {
      id: "brand",
      label: "Brand & Appearance",
      icon: IconPalette,
      description: "Logos, themes, and icon customization",
      sections: [
        { value: "brand", label: "Brand Settings", icon: IconPalette },
      ],
    },
    {
      id: "testing",
      label: "Testing & Verification",
      icon: IconShieldCheck,
      description: "GAAP audit, compliance & QA",
      sections: [
        { value: "verification", label: "Verification", icon: IconFileCheck },
        { value: "qa-sandbox",   label: "QA Sandbox",   icon: IconShieldCheck },
      ],
    },
    {
      id: "app-settings",
      label: "App Settings",
      icon: IconSettingsGear,
      description: "Notifications, sidebar visibility, system & activity logs",
      sections: [
        { value: "notifications",  label: "Notifications",  icon: IconPhone },
        { value: "sidebar-visibility", label: "Sidebar Visibility", icon: IconPanelLeft },
        { value: "database",       label: "Database",       icon: IconDatabase },
        { value: "observability",  label: "Observability",  icon: IconDashboard },
        { value: "activity",       label: "Activity",       icon: IconActivity },
      ],
    },
  ];
}
```

**Replace with:**

```typescript
function buildNavGroups(): NavGroup[] {
  return [
    {
      id: "financial-defaults",
      label: "Model Defaults",
      icon: IconSettings2,
      description: "Default values and constants applied to new entities and the financial model",
      sections: [
        { value: "defaults-management-company", label: "Management Company", icon: IconBriefcase },
        { value: "defaults-property",           label: "Property",           icon: IconProperties },
        { value: "constants",                   label: "Constants",          icon: IconCalculator },
        { value: "analyst-tables",              label: "Analyst Tables",     icon: IconBrain },
        { value: "reference-ranges",            label: "Reference Ranges",   icon: IconRuler },
      ],
    },
    {
      id: "portfolio",
      label: "Portfolio",
      icon: IconBuilding2,
      description: "Properties, scenarios, and default assignments",
      sections: [
        { value: "required-fields",      label: "Required Fields",      icon: IconFileCheck },
        { value: "property-heroes",      label: "Property Heroes",      icon: IconImage },
        { value: "scenarios",            label: "All Scenarios",        icon: IconGitCompareArrows },
        { value: "default-assignments",  label: "Default Assignments",  icon: IconUserCog },
      ],
    },
    {
      id: "users",
      label: "Users",
      icon: IconPeople,
      description: "Manage user accounts and assignments",
      sections: [
        { value: "users", label: "All Users", icon: IconPeople },
      ],
    },
    {
      id: "brand",
      label: "Brand & Appearance",
      icon: IconPalette,
      description: "Logos, themes, and icon customization",
      sections: [
        { value: "brand", label: "Brand Settings", icon: IconPalette },
      ],
    },
    {
      id: "testing",
      label: "Testing & Verification",
      icon: IconShieldCheck,
      description: "GAAP audit, compliance & QA",
      sections: [
        { value: "verification", label: "Verification", icon: IconFileCheck },
        { value: "qa-sandbox",   label: "QA Sandbox",   icon: IconShieldCheck },
      ],
    },
    {
      id: "app-settings",
      label: "App Settings",
      icon: IconSettingsGear,
      description: "Notifications, sidebar visibility, system & activity logs",
      sections: [
        { value: "notifications",      label: "Notifications",      icon: IconPhone },
        { value: "sidebar-visibility", label: "Sidebar Visibility", icon: IconPanelLeft },
        { value: "database",           label: "Database",           icon: IconDatabase },
        { value: "observability",      label: "Observability",      icon: IconDashboard },
        { value: "activity",           label: "Activity",           icon: IconActivity },
      ],
    },
  ];
}
```

**What changed:**
- `"Steady State"` → `"Model Defaults"`, icon `IconSliders` → `IconSettings2`
- `"Reference Ranges"` icon `IconCalculator` → `IconRuler` (deduplicates within the group)
- Removed the separate `"properties"` group
- Removed the separate `"scenarios"` group
- Added `"portfolio"` group (`IconBuilding2`) containing all four sections:
  - Required Fields, Property Heroes (from old Properties group)
  - All Scenarios (`IconGitCompareArrows`), Default Assignments (from old Scenarios group)

---

## Verification

After pasting, run in the portal workspace:

```bash
pnpm --filter @workspace/hospitality-business-portal run typecheck
```

Expected: clean (no errors). The existing `SECTION_REDIRECTS` and `getGroupForSection()` logic are unaffected — all section values are unchanged, only their group container changed.
