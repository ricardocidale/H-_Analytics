---
title: Admin & Intelligence Sidebar UX Restructure
status: active
created: 2026-05-19
depth: standard
---

# Admin & Intelligence Sidebar UX Restructure

## Problem Frame

Both sidebars have accumulated structural drift across several task sequences:
labels that no longer describe what they hold, items grouped in the wrong place,
and one agent (Iris) marooned inside a "Conversational" group she has nothing
to do with. The changes here are purely presentational — no backend routes,
schema, or business logic is touched. All section value slugs, type unions, and
URL aliases are preserved for backward compat; only labels, group membership,
and nav icons change.

## Scope

**In scope:**
- `AdminSidebar.tsx` — rename labels, move items between existing groups
- `IntelligenceSidebar.tsx` — rename labels, restructure groups, remove Iris from nav,
  split one group into two, move Animations, change back-link icon
- `Breadcrumbs.tsx` — keep breadcrumb labels in sync with the new sidebar labels

**Out of scope:**
- Section value slugs (e.g. `"observability"`, `"iris"`, `"llms-other"`) — never change;
  kept for deep-link backward compat
- `AdminSection` and `IntelligenceSection` TypeScript unions — no additions or removals
- `SECTION_REDIRECTS`, `SPECIALIST_SECTION_TO_ID`, `getGroupForSection` fallback block
  (Iris is already in the fallback, mapping to `"agent-roster"`)
- Backend routes, API contracts, DB schema
- Surfaces permanently off-limits: `lib/engine/`, `lib/calc/`, `lib/shared/constants*`,
  `lib/db/`, `artifacts/api-server/src/finance/`, `src/report/`, `src/migrations/`
- `IrisPanel.tsx` content — untouched; Iris remains accessible via Agent Roster → Agents card

## Key Decisions

**D1 — Iris leaves the sidebar nav, not the router.**
Iris's section value (`"iris"`) stays in `IntelligenceSection` and in
`getGroupForSection`'s legacy fallback (already maps to `"agent-roster"`). Only the
explicit `SectionItem` row in the "agents" group is removed. Deep links to
`?section=iris` continue to resolve and show `IrisPanel` — they just reach it via
the Agents roster card rather than a dedicated sidebar entry. Rationale: Iris is a
monitoring/trigger surface (status + two action buttons), identical in shape to
Gustavo's detail page. She has no sub-sections and no config depth that would justify
a permanent nav slot.

**D2 — "Conversational" group renamed "Rebecca", group id changes to `"rebecca"`.**
The group previously called "Conversational" (`id: "agents"`) becomes the Rebecca
group (`id: "rebecca"`). Renaming the id from `"agents"` is safe: the only consumer
of group ids is the `data-testid` attribute on the group container
(`intelligence-nav-group-agents` → `intelligence-nav-group-rebecca`) and no tests
reference this testid (confirmed by grep). The "iris" fallback in `getGroupForSection`
still returns `"agent-roster"` — it is not affected by the group id rename.

**D3 — "Knowledge & Resources" splits into two groups.**
The current single group is overloaded (7 items spanning two distinct purposes).
It splits into:
- **"Knowledge & Data"** (`id: "knowledge-data"`) — data sources, registries, financial tables
- **"Resources"** (`id: "resources"`) — Resources Catalog only (single item)

The single-item "Resources" group follows the existing Intelligence sidebar rendering
convention (group label + single sub-item). No special flat-rendering logic is added —
that pattern lives only in AdminSidebar. Assumption Guidance moves here from System.

**D4 — Animations moves to Agent Roster.**
Animations (`value: "animations"`) is "Agent persona animations and motion assets for
Rebecca and The Analyst." That is Intelligence-domain content, not generic brand assets.
It moves from "Knowledge & Resources" to the Agent Roster group as a 4th section item.
No change to the section value or breadcrumb label.

**D5 — Intelligence back-link icon: `IconShield` → `IconArrowLeft`.**
The current shield icon implies security/admin, not navigation. `IconArrowLeft` is
already exported from `@/components/icons` and unambiguously signals "go back."

**D6 — Breadcrumb `AI_INTEL` constant label: "AI Intelligence" → "Intelligence".**
Matches the renamed landmark. Href unchanged (`/intelligence`).

---

## Implementation Units

### IU-A — `AdminSidebar.tsx`

**File:** `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`

**Changes (all inside `buildNavGroups()` and the sidebar render):**

| What | Where | Change |
|---|---|---|
| Back-link label | Sidebar header render (search for "AI Intelligence") | `"AI Intelligence"` → `"Intelligence"` |
| Group label | `id: "testing"` | `"Testing & Verification"` → `"Quality & Audit"` |
| Group label | `id: "configuration"` | `"Configuration"` → `"Preferences"` |
| Section label | `observability` item in `system` group | `"Observability"` → `"Monitoring"` |
| Section label | `activity` item in `system` group | `"Activity"` → `"Audit Log"` |
| Section label | `login-settings` item in `system` group | `"Login"` → `"Authentication"` |
| Section label | `brand-assets-other-graphics` in `brand-assets` group | `"Other Graphics"` → `"Graphics"` |
| Section move | `required-fields` | Remove from `portfolio` group; add as **first** item in `testing` group |
| Section move | `brand-themes` | Remove from `system` group; add as **last** item in `brand-assets` group |
| Group description | `system` group | Update prose to reflect `brand-themes` removal (e.g. `"Database, monitoring, and audit logs"`) |
| Group description | `brand-assets` group | Update to mention themes (e.g. `"Logos, animations, graphics, and colour themes"`) |
| Group description | `testing` group | Update to mention required-fields (e.g. `"GAAP audit, compliance, QA, and required field coverage"`) |

**`getGroupForSection` impact:** none. The function iterates groups and finds the section
in its new group automatically. `resolveSection` is unaffected.

**Test file:** none specific to sidebar labels; `tests/client/admin-sidebar-section-map.test.ts`
tests `SPECIALIST_SECTION_TO_ID` bijectivity only — not touched by these changes.

**Test scenarios:**
1. "Required Fields" appears inside the "Quality & Audit" group accordion, not "Portfolio."
2. "Themes" appears inside "Brand Assets" group accordion, not "System."
3. "Testing & Verification" label is gone; "Quality & Audit" appears in its place.
4. "Configuration" label is gone; "Preferences" appears in its place.
5. "Observability" → "Monitoring", "Activity" → "Audit Log", "Login" → "Authentication"
   each appear under System with the correct new label.
6. "Other Graphics" → "Graphics" appears under Brand Assets.
7. Navigating to `?section=required-fields` highlights inside "Quality & Audit" group (open).
8. Navigating to `?section=brand-themes` highlights inside "Brand Assets" group (open).

---

### IU-B — `IntelligenceSidebar.tsx`

**File:** `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`

**Changes:**

| What | Where | Change |
|---|---|---|
| Back-link icon | Sidebar header render (search `IconShield`) | `IconShield` → `IconArrowLeft` |
| Import | Top-level imports | Add `IconArrowLeft` to the `@/components/icons` destructure; remove `IconShield` if unused elsewhere in this file |
| Group label + id | `id: "agents"` group | label `"Conversational"` → `"Rebecca"`; id `"agents"` → `"rebecca"` |
| Section removal | `"agents"` group sections | Remove the `{ value: "iris", … }` SectionItem entirely |
| Group label | `id: "llms"` group | `"LLMs"` → `"Models"` |
| Section label | `llms-other` item in `llms` group | `"Other"` → `"Operations"` |
| Section label | `vector-bench` item in `system` group | `"Vector Search Latency"` → `"Search Performance"` |
| Section move | `animations` | Remove from `knowledge-resources` group; add as 4th section in `agent-roster` group |
| Group split | `id: "knowledge-resources"` | Replace with **two** groups (see below) |
| Section move | `assumption-guidance` | Remove from `system` group; add to new `knowledge-data` group |
| Doc comment | `buildNavGroups()` block comment | Update to reflect new structure |

**Group split detail — replace `knowledge-resources` with:**

```typescript
// New group 1
{
  id: "knowledge-data",
  label: "Knowledge & Data",
  icon: IconBookOpen,
  sections: [
    { value: "knowledge-registry",              label: "Knowledge Registry",    icon: IconBookOpen },
    { value: "knowledge-registry-country-data", label: "Country Economic Data", icon: IconActivity },
    { value: "resources-tables",                label: "Market Data",           icon: IconActivity },
    { value: "benchmark-bands",                 label: "Benchmark Bands",       icon: IconActivity, tooltip: … },
    { value: "analyst-tables",                  label: "Analyst Tables",        icon: IconBrain,    tooltip: … },
    { value: "assumption-guidance",             label: "Assumption Guidance",   icon: IconActivity, tooltip: … },
  ],
},
// New group 2
{
  id: "resources",
  label: "Resources",
  icon: IconSettingsGear,
  sections: [
    { value: "resources", label: "Resources Catalog", icon: IconSettingsGear },
  ],
},
```

Tooltips for benchmark-bands, analyst-tables, and assumption-guidance are copied
verbatim from the existing items.

**`getGroupForSection` impact:**
- `"iris"` is **already** in the legacy fallback block (lines 309–316), returning
  `"agent-roster"`. No change needed.
- `"animations"` will be found in `agent-roster` by the normal iteration loop.
- `"assumption-guidance"` will be found in `knowledge-data` by the normal iteration loop.
- `"resources"` (the section value) will be found in the new `resources` group.
- The group id rename `"agents"` → `"rebecca"` does not affect `getGroupForSection`
  because it returns the group id found by iteration; callers use it to set `activeGroup`
  for accordion open/close, and that group id is what the accordion uses as its key.
  Update any hardcoded `"agents"` group-id reference in the render section (search
  for `"agents"` string literals below `buildNavGroups`).

**Test file:** no dedicated unit tests for sidebar structure. Visual verification
via screenshot is the primary check.

**Test scenarios:**
1. "Iris" no longer appears as a sidebar nav item under any group.
2. The group previously called "Conversational" now shows label "Rebecca".
3. "Conversational" Rebecca sub-items (Configuration/Knowledge Base/Conversations)
   still render and navigate correctly.
4. "Knowledge & Resources" group label is gone; "Knowledge & Data" and "Resources"
   appear as two separate groups.
5. "Assumption Guidance" appears under "Knowledge & Data", not under "System."
6. "Resources Catalog" appears under the "Resources" group.
7. "Animations" appears under "Agent Roster", not under "Knowledge & Data."
8. "LLMs" label is gone; "Models" appears in its place with the same four sub-items.
9. "Other" sub-item under Models is now labelled "Operations."
10. "Vector Search Latency" is now labelled "Search Performance" under System.
11. Back-link to `/admin` renders with a left-arrow icon, not a shield.
12. Deep-linking to `?section=iris` still resolves and shows IrisPanel (via Agent Roster).
13. Deep-linking to `?section=assumption-guidance` highlights inside "Knowledge & Data" (open).
14. Deep-linking to `?section=animations` highlights inside "Agent Roster" (open).

---

### IU-C — `Breadcrumbs.tsx`

**File:** `artifacts/hospitality-business-portal/src/components/Breadcrumbs.tsx`

**Changes (label strings only — no logic):**

| Constant / key | Old value | New value |
|---|---|---|
| `AI_INTEL.label` | `"AI Intelligence"` | `"Intelligence"` |
| `INTEL_SECTION_LABEL["llms-agents"]` | `"LLMs · Agents"` | `"Models · Agents"` |
| `INTEL_SECTION_LABEL["llms-research"]` | `"LLMs · Research"` | `"Models · Research"` |
| `INTEL_SECTION_LABEL["llms-graphics"]` | `"LLMs · Graphics"` | `"Models · Graphics"` |
| `INTEL_SECTION_LABEL["llms-other"]` | `"LLMs · Other"` | `"Models · Operations"` |
| `INTEL_SECTION_LABEL["llm-workflows"]` | `"LLMs · Agents"` | `"Models · Agents"` (legacy alias) |
| `INTEL_SECTION_LABEL["vector-bench"]` | `"Vector Search Latency"` | `"Search Performance"` |
| `ADMIN_SECTION_LABEL["observability"]` | `"Observability"` | `"Monitoring"` |
| `ADMIN_SECTION_LABEL["activity"]` | `"Activity"` | `"Audit Log"` |
| `ADMIN_SECTION_LABEL["login-settings"]` | `"Login"` | `"Authentication"` |

**Keys that stay unchanged:**
- `INTEL_SECTION_LABEL["iris"]` → `"Iris"` (deep-link still valid)
- `INTEL_SECTION_LABEL["animations"]` → `"Animations"` (label unchanged, just moved group)
- `INTEL_SECTION_LABEL["assumption-guidance"]` → `"Assumption Guidance"` (label unchanged)
- `ADMIN_SECTION_LABEL["brand-themes"]` → `"Themes"` (page-level breadcrumb, not the group label)

**Test scenarios:**
1. Breadcrumb at `/intelligence` root shows "Intelligence" (not "AI Intelligence").
2. Breadcrumb for `?section=llms-agents` shows "Models · Agents."
3. Breadcrumb for `?section=llms-other` shows "Models · Operations."
4. Breadcrumb for `?section=vector-bench` shows "Search Performance."
5. Admin breadcrumb for `#observability` shows "Monitoring."
6. Admin breadcrumb for `#activity` shows "Audit Log."
7. Admin breadcrumb for `#login-settings` shows "Authentication."

---

## Sequencing

All three units are independent and can be done in a single pass or in any order.
IU-A and IU-B touch disjoint files. IU-C depends on knowing the final labels (captured
in this plan) but has no code dependency on IU-A or IU-B.

Suggested order: IU-B (most structural change) → IU-A → IU-C.

---

## Verification Checklist

Run after completing all three units:

```bash
pnpm --filter @workspace/hospitality-business-portal run typecheck
pnpm run check:lint
pnpm run check:ui-canonical
```

Then take a screenshot of both sidebars in the app preview and confirm:
- No stale group labels remain
- Iris does not appear as a top-level sidebar nav item
- Both "Knowledge & Data" and "Resources" groups are visible in Intelligence
- Rebecca group shows 3 sub-items (Configuration / Knowledge Base / Conversations)

No backend checks required — this plan touches only frontend presentation files.
