---
title: "CurrentThemeTab as canonical horizontal tab component — migration convention"
date: "2026-05-16"
category: "docs/solutions/conventions"
module: "hospitality-business-portal/admin-components"
problem_type: "convention"
component: "frontend_stimulus"
severity: "high"
applies_when:
  - "Implementing any horizontal tab menu in the admin panel or portal"
  - "Migrating existing Radix UI Tabs/TabsList/TabsTrigger/TabsContent to CurrentThemeTab"
  - "Adding a new tabbed view to any admin section"
  - "Tab content has multiple root JSX elements (header + content, multiple Cards)"
tags:
  - "design-system"
  - "react-patterns"
  - "component-migration"
  - "fragment-wrapper"
  - "admin-panel"
  - "radix-ui"
  - "tabs"
  - "flex-label-overflow"
---

# CurrentThemeTab as canonical horizontal tab component — migration convention

## Context

The H+ Analytics admin panel originally used Radix UI primitives (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) for all horizontal tab navigation. As the design system matured, these primitives scattered styling and theming logic across every component that used them. A sweep of 9 admin components in May 2026 converted all of them to `CurrentThemeTab` — the design system's canonical, single-source-of-truth tab component. This document records the migration pattern, the critical Fragment wrapper gotcha, and the companion flex-label-overflow fix that typically surfaces during the same work.

**`CurrentThemeTab` lives at:**
```
artifacts/hospitality-business-portal/src/components/ui/tabs.tsx
```

**Components converted (May 2026):**
`ModelDefaultsTab`, `DiagramsTab`, `DataSourcesTab`, `KnowledgeBaseEditor`, `CompanyTab`, `verification/index`, `NotificationsTab`, `AssetDefinitionTab`, `ResourceDetailDialog`

## Guidance

### The six-step migration

**Step 1 — Add controlled state for the active tab**

```typescript
const [activeTab, setActiveTab] = useState("first-tab-value");
```

**Step 2 — Define the tabs array**

```typescript
const TABS: CurrentThemeTabItem[] = [
  { value: "overview",  label: "Overview" },
  { value: "settings",  label: "Settings", icon: Settings },
  { value: "history",   label: "History",  count: 12 },
];
```

`CurrentThemeTabItem` supports:
- `value: string` — unique tab identifier (used for state comparison)
- `label: string` — displayed text
- `icon?: React.ComponentType<{ className?: string }>` — optional icon
- `statusDot?: string` — optional Tailwind color class for a status indicator (e.g. `"text-amber-500"`)
- `count?: number` — optional numeric badge

**Step 3 — Replace `<Tabs>` wrapper with a plain `<div>`**

The `<Tabs defaultValue="x">` outer wrapper becomes `<div className="space-y-6">` (or whatever spacing suits the layout).

**Step 4 — Replace `<TabsList>` / `<TabsTrigger>` with `<CurrentThemeTab>`**

```typescript
<CurrentThemeTab
  tabs={TABS}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

The `rightContent` prop optionally places a React node right-aligned in the tab bar (e.g. a refresh button or help icon).

**Step 5 — Replace `<TabsContent>` with conditional renders**

```typescript
{activeTab === "overview"  && <OverviewPanel />}
{activeTab === "settings"  && <SettingsPanel />}
{activeTab === "history"   && <HistoryPanel />}
```

**Step 6 — Update imports**

Remove:
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
```

Add:
```typescript
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
```

---

### Critical gotcha — Fragment wrapper for multi-root tabs

When a tab's content has **more than one root JSX element** (e.g. a header `<div>` plus a `<Card>`, or two `<Card>` components), the conditional render **must** wrap with a Fragment:

```typescript
{activeTab === "rules" && (
  <>
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold font-display">Alert Rules</h3>
        <p className="text-sm text-muted-foreground">Define threshold rules…</p>
      </div>
      <Button className="shrink-0" onClick={openDialog}>
        <Plus className="w-4 h-4 mr-1" /> Add Rule
      </Button>
    </div>

    {rules.length === 0 ? (
      <Card><CardContent className="py-12 text-center">No rules yet.</CardContent></Card>
    ) : (
      <div className="space-y-3">{rules.map((r) => <RuleCard key={r.id} rule={r} />)}</div>
    )}
  </>
)}
```

**Without `<>…</>`, ESLint reports: `Parsing error: JSX expressions must have one parent element` — this is a hard lint failure that blocks the check:lint gate.**

The Fragment is invisible to React and has no performance cost. Every tab that wraps multiple sibling elements needs one.

---

### Companion fix — flex-label-overflow

When migrating tabs that contain `flex justify-between` containers (e.g. label + button, label + badge), apply the flex-label-overflow pattern to prevent the label from overflowing into the value's space:

```typescript
{/* First child (label side) → min-w-0 */}
{/* Second child (value side) → shrink-0 */}

<div className="flex items-center justify-between">
  <div className="text-sm font-medium min-w-0">{specialistName}</div>
  <ScorePill score={score} className="shrink-0" />
</div>
```

If the value-side component does not accept `className`, wrap it:

```typescript
<div className="flex items-center justify-between">
  <Label className="min-w-0">Status</Label>
  <span className="shrink-0"><Badge>Active</Badge></span>
</div>
```

The `check:flex-label-overflow` gate catches violations automatically. After fixing, run:
```bash
pnpm --filter @workspace/scripts run check:flex-label-overflow:init
```
to tighten the baseline. Six violations were fixed during the May 2026 sweep (baseline: 177).

## Mechanical Enforcement (shipped 2026-05-17, Plan 2026-05-16-004)

CLAUDE.md §13 codifies this convention at the same severity as §1 (no-hardcoded-values). The gate is:

```
scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts
```

**What it catches (Rule B in the checker):**

- Direct imports of `TabsList` or `TabsTrigger` from `@/components/ui/tabs` outside `tabs.tsx` itself.
- Hand-rolled `<button>` rows paired with `activeTab === ` toggle styling within five lines (heuristic — flags the canonical pattern Replit Agent re-creates).
- `TabsContent` imports remain permitted (panel content wrapper, not the tab strip).

The checker also covers Rule A (canonical "Analyst" CTA — text, identifiers, and `<AnalystActionButton label="X">` JSX prop with a multi-line buffer). See CLAUDE.md §13 for the combined rule statement and `.agents/skills/analyst-research-buttons/SKILL.md` for Rule A details.

**Companion gate:** `check:gate-health` (`scripts/src/check-gate-health.ts`) asserts that the UI canonical gate remains FILE-EXISTS / CI-WIRED / EFFECTIVE on every CI build — prevents the silent-disablement failure mode documented at `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`.

**Known limitations of the regex approach:**

| Bypass pattern | Example | Status |
|---|---|---|
| Variable-resolved label | `<AnalystActionButton label={ctaLabel} />` | Not caught — code review |
| Template literal | `` <Button>{`Ask${" "}Analyst`}</Button> `` | Not caught — code review |
| i18n key | `<Button>{t('cta.ask_analyst')}</Button>` | Not caught — code review |

Closing these requires either (a) removing the `label?` prop entirely (32-file caller sweep — deferred) or (b) migrating Rule A enforcement to a TypeScript-AST tool (ESLint plugin — deferred). Plan 2026-05-16-004 §"Known Limitations of the Regex Approach" carries the full enumeration.

**Adding a new affordance:** if a migration target reveals a need not met by `suffix` / `trailingIcon` / `disabled` + `tooltipTitle` / `responsive` / `variant`, extend `CurrentThemeTab` in `components/ui/tabs.tsx` per the additive-prop pattern in `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md`. **Do not allow-list at the checker level** — that re-creates the prose-rule-drift failure mode the gate was built to prevent.

## Why This Matters

1. **Single theming point** — All tab styling (accent colors, focus rings, dark mode, active indicator) lives in `tabs.tsx`. No scattered Radix overrides.
2. **Lint safety** — The Fragment wrapper rule is enforced by ESLint's JSX parse check; missing it causes a hard gate failure.
3. **Design consistency** — Every admin page renders the same tab chrome: font, spacing, active underline, hover state.
4. **Maintainability** — Adding keyboard navigation, animation, or accessibility improvements requires one change in `tabs.tsx`, not nine.

## When to Apply

- Any horizontal tab menu in admin pages or portal sections
- New tabbed views: start with `CurrentThemeTab` directly — never reach for Radix primitives
- Existing Radix usage anywhere in the portal: convert on next touch
- Does **not** apply to vertical navigation or sidebar menus (those use `AdminSidebar.tsx` patterns)

## Examples

### Example A — Simple single-root conversion (`ModelDefaultsTab`)

**Before (Radix):**
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ModelDefaultsTab() {
  return (
    <Tabs defaultValue="company">
      <TabsList>
        <TabsTrigger value="company">Company</TabsTrigger>
        <TabsTrigger value="market-macro">Market & Macro</TabsTrigger>
        <TabsTrigger value="constants">Constants</TabsTrigger>
      </TabsList>
      <TabsContent value="company"><CompanyTab /></TabsContent>
      <TabsContent value="market-macro"><MarketMacroTab /></TabsContent>
      <TabsContent value="constants"><ModelConstantsTab /></TabsContent>
    </Tabs>
  );
}
```

**After (CurrentThemeTab):**
```typescript
import { useState } from "react";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";

const TABS: CurrentThemeTabItem[] = [
  { value: "company",      label: "Company" },
  { value: "market-macro", label: "Market & Macro" },
  { value: "constants",    label: "Constants" },
];

export default function ModelDefaultsTab() {
  const [activeTab, setActiveTab] = useState("company");
  return (
    <div className="space-y-4">
      <CurrentThemeTab tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "company"      && <CompanyTab />}
      {activeTab === "market-macro" && <MarketMacroTab />}
      {activeTab === "constants"    && <ModelConstantsTab />}
    </div>
  );
}
```

### Example B — Multi-root Fragment wrapper (`NotificationsTab` rules tab)

The `"rules"` tab has two root elements: a header section with a button, and either an empty state card or a list.

```typescript
{activeTab === "rules" && (
  <>
    {/* ROOT 1 — header + action */}
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold font-display">Alert Rules</h3>
        <p className="text-sm text-muted-foreground">
          Define threshold rules that trigger notifications when metrics breach limits.
        </p>
      </div>
      <Button className="shrink-0" onClick={() => setRuleDialogOpen(true)}>
        <Plus className="w-4 h-4 mr-1" /> Add Rule
      </Button>
    </div>

    {/* ROOT 2 — empty state or list */}
    {alertRulesList.length === 0 ? (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No alert rules configured yet.
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-3">
        {alertRulesList.map((rule) => <RuleCard key={rule.id} rule={rule} />)}
      </div>
    )}
  </>
)}
```

Note that `Button` above also carries `className="shrink-0"` — a flex-label-overflow fix applied during the same conversion.

## Related

- `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md` — design discipline for extending components without breaking consumers; the philosophy behind choosing CurrentThemeTab over local Radix overrides
- `docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md` — the same standardization discipline applied to sidebar nav; CurrentThemeTab follows the same pattern
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — documents the slide factory's tabbed UI, which also uses the CurrentThemeTab pattern post-migration
