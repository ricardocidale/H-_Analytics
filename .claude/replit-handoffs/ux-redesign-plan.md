# UX Redesign — Within-Page Design

**Status:** Plan ready. Replit implements in phases. CC reviews each phase before next starts.
**Tabled:** 2026-05-01. Resume when user is ready.
**Scope:** Company Assumptions, Property Edit, Admin section, AI Intelligence section.
**Approved — do NOT touch:** Dashboard, first-level Management Company page, first-level Property page.

---

## Design Principles (binding for all phases)

These are non-negotiable. Every PR must satisfy all of them before CC approves.

### 1. Scan-first, edit-second
Every section shows the **current value at a glance** when collapsed. The user never has to open a section to see what's in it. Labels + values are always visible in the header row. Edit controls are revealed only on expand.

### 2. Summary before detail
At the top of each tab or page, a compact strip of `<StatCard variant="dashboard">` shows 4–6 key numbers for that section. Users orient themselves here before drilling in. Think of it as the "cockpit view."

### 3. Consistent visual hierarchy — 3 levels only
- **Level 1:** Page/tab header (title, description, Save + AnalystButton)
- **Level 2:** `<SectionCard>` (collapsible group of related fields — icon, title, subtitle, expand chevron)
- **Level 3:** Individual field rows inside each section (label, value, edit control, ResearchBadge)
No extra nesting. No card inside a card inside a card.

### 4. Status at a glance with badges
Every SectionCard header includes a small status badge:
- `<Badge variant="outline" className="text-primary">` for in-range values
- `<Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">` for flagged/out-of-range
- `<Badge className="bg-muted text-muted-foreground">` for empty/not-set
This lets users spot issues without expanding anything.

### 5. Framer Motion for accordion animations
All expand/collapse transitions use `framer-motion` — `AnimatePresence` + `motion.div` with `initial={{ height: 0, opacity: 0 }}` / `animate={{ height: "auto", opacity: 1 }}`. Duration 200ms, ease "easeInOut". No CSS-only transitions (they clip content).

### 6. Existing components only — no new UI primitives
Use only components already installed:
- `<SectionCard>` from `@/components/ui/section-card` (collapsible group)
- `<StatCard variant="dashboard">` from `@/components/ui/stat-card` (KPI tile)
- `<ResearchBadge>` from `@/components/ui/research-badge` (Analyst range pill)
- `<Sheet>` from `@/components/ui/sheet` (slide-in edit panel)
- `<Table>` + `<TableBody>` + `<TableRow>` from `@/components/ui/table` (roster views)
- `<Badge>` from `@/components/ui/badge` (status indicators)
- `<HoverCard>` from `@/components/ui/hover-card` (inline detail on hover)
- `<Accordion>` from `@/components/ui/accordion` (for table-row detail expansion)

### 7. No layout changes to pages not listed in scope
Do not reorder tabs, rename tabs, change routes, or modify navigation. Layout surgery is out of scope.

### 8. Mobile-last — design desktop first
These are complex financial assumption editors. Target 1280px+ desktop. Mobile is a stretch goal, not a requirement for these phases.

---

## Available Components — Quick Reference

All already installed. Import paths shown.

```typescript
// Collapsible section group (use for every logical group of fields)
import { SectionCard } from "@/components/ui/section-card";
// Props: id, title, subtitle, icon, expanded, onToggle, sectionRef, children, variant

// KPI tile (use for summary strips at top of tabs)
import { StatCard } from "@/components/ui/stat-card";
// Props: label, value, format("money"|"percent"|"number"|"text"), trend, description, variant="dashboard"

// Analyst range pill (use next to every assumption field that has research)
import { ResearchBadge } from "@/components/ui/research-badge";

// Slide-in panel (use for Admin + AI Intelligence row-click editing)
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

// Status badge (use in SectionCard headers)
import { Badge } from "@/components/ui/badge";

// Data table (use for Admin groups and AI Intelligence roster)
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Hover detail
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

// Accordion (use inside tables for expandable row detail)
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Framer Motion (use for all expand/collapse)
import { AnimatePresence, motion } from "framer-motion";
```

---

## Phase UX-1 — Company Assumptions: Summary Strip + Section Groups

**Target files:**
- `client/src/components/company-assumptions/CompanyAssumptionsTabsView.tsx` (primary)
- `client/src/components/company-assumptions/FundingSection.tsx`
- `client/src/components/company-assumptions/CompensationSection.tsx`
- `client/src/components/company-assumptions/FixedOverheadSection.tsx`
- `client/src/components/company-assumptions/ManagementFeesSection.tsx`

**Problem:** 5 tabs, each with a long vertical form. No at-a-glance view of current values. Users must scroll the entire form to understand what's set.

**Solution:** Two changes per tab:
1. **Summary strip** — 4 `<StatCard variant="dashboard">` cards in a 2×2 or 4-across grid at the top of each tab, showing the most important numbers from that tab's current `formData`.
2. **Section groups** — Wrap each logical group of fields in `<SectionCard>`, collapsed by default, with a status badge in the header showing whether values are set/flagged/empty.

### UX-1a: Funding tab

**Summary strip (4 cards):**
```typescript
// Above the existing FundingSection content, add:
<div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
  <StatCard variant="dashboard" label="Total Raise" value={totalRaise} format="money" />
  <StatCard variant="dashboard" label="Valuation Cap" value={formData.capitalRaise1ValuationCap ?? 0} format="money" />
  <StatCard variant="dashboard" label="Cost of Equity" value={(formData.costOfEquity ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="Tranche 2" value={formData.enableSecondTranche ? "Enabled" : "Off"} format="text" />
</div>
```

**Section groups:** Wrap `<CapitalRaisesCard>` and `<CostOfEquityCard>` each in `<SectionCard>`:
- "Capital Raises" section: icon = `DollarSign` from lucide, expanded by default
- "Cost of Equity (DCF Rate)" section: icon = `TrendingUp`, collapsed by default

**Status badge on section header:** If either raise amount is 0 or unset → show amber "Setup needed" badge. Otherwise → show green "Configured" badge.

**Acceptance criteria:**
- [ ] 4 StatCards visible at top of Funding tab, values update in real-time as form changes
- [ ] Two SectionCard groups below; Capital Raises expanded by default, Cost of Equity collapsed
- [ ] Each SectionCard header shows a status badge
- [ ] Expand/collapse uses Framer Motion AnimatePresence (200ms ease)
- [ ] Save + AnalystButton remain below the sections, not inside any SectionCard
- [ ] No TS errors; `npm run test:summary` passes

---

### UX-1b: Revenue Model tab

**Summary strip (4 cards):**
```typescript
<div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
  <StatCard variant="dashboard" label="Active Services" value={activeServiceCount} format="number" />
  <StatCard variant="dashboard" label="Base Fee" value={(formData.managementFeeBase ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="Incentive Fee" value={(formData.managementFeeIncentive ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="Properties" value={properties.length} format="number" description="earning fees" />
</div>
```

**Section groups:**
- "Management Fees" section: icon = `Percent`, base fee + incentive fee sliders
- "Service Templates" section: icon = `Layers`, service list + Add button
- "Per-Property Summary" section: icon = `Building2`, the PropertyFeeSummaryTable, collapsed by default

**Acceptance criteria:**
- [ ] 4 StatCards visible, active service count computed from `allFeeCategories`
- [ ] Three SectionCard groups; first two expanded, Per-Property Summary collapsed
- [ ] Per-Property Summary SectionCard header shows "N properties" badge

---

### UX-1c: Compensation tab

**Summary strip (4 cards):**
```typescript
<div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
  <StatCard variant="dashboard" label="Partner Draw Y1" value={formData.partnerCompYear1 ?? 0} format="money" />
  <StatCard variant="dashboard" label="Staff FTE" value={currentFte} format="number" description="based on portfolio size" />
  <StatCard variant="dashboard" label="Avg Salary" value={formData.staffSalaryPerFte ?? 0} format="money" description="per FTE" />
  <StatCard variant="dashboard" label="Y3 Escalation" value={`${formData.partnerCompYear3 ?? 0}`} format="money" description="partner draw" />
</div>
```

**Section groups:**
- "Partner Compensation" section: icon = `Users`, Y1-Y3 draw schedule
- "Staff & Salaries" section: icon = `UserCog`, FTE salary, staffing tiers
- "Staffing Tiers" section: icon = `BarChart3`, tier thresholds, collapsed by default

**Acceptance criteria:**
- [ ] 4 StatCards; `currentFte` derived from portfolio size + tier thresholds
- [ ] Three SectionCard groups; Staffing Tiers collapsed by default
- [ ] No change to form field behavior or validation

---

### UX-1d: Overhead tab

**Summary strip (4 cards):**
```typescript
<div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
  <StatCard variant="dashboard" label="Total Fixed OH" value={totalFixedOverhead} format="money" description="per year" />
  <StatCard variant="dashboard" label="Variable Rate" value={(formData.variableCostRate ?? 0) * 100} format="percent" description="of revenue" />
  <StatCard variant="dashboard" label="Office Lease" value={formData.officeLeaseStart ?? 0} format="money" description="per year" />
  <StatCard variant="dashboard" label="Escalation" value={(formData.fixedCostEscalationRate ?? DEFAULT_FIXED_COST_ESCALATION_RATE) * 100} format="percent" description="annual" />
</div>
```

**Section groups:**
- "Fixed Overhead" section: icon = `Building`, all fixed cost fields
- "Variable Costs" section: icon = `Activity`, variable rate + description

**Acceptance criteria:**
- [ ] 4 StatCards; `totalFixedOverhead` computed as sum of all fixed cost fields
- [ ] Two SectionCard groups; both expanded by default
- [ ] SectionCard header badge: "N line items configured" for Fixed Overhead

---

### UX-1e: Property Defaults tab

**Summary strip (4 cards):**
```typescript
<div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
  <StatCard variant="dashboard" label="Exit Cap Rate" value={(formData.defaultExitCapRate ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="Sales Commission" value={(formData.defaultSalesCommission ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="Occupancy Default" value={(formData.defaultOccupancy ?? 0) * 100} format="percent" />
  <StatCard variant="dashboard" label="ADR Growth" value={(formData.defaultAdrGrowth ?? 0) * 100} format="percent" description="annual" />
</div>
```

**Section groups:**
- "Exit & Sales" section: icon = `LogOut`, cap rate + commission
- "Revenue Defaults" section: icon = `TrendingUp`, occupancy + ADR + growth rates
- "Cost Defaults" section: icon = `Receipt`, expense ratio defaults

**Acceptance criteria:**
- [ ] 4 StatCards from formData
- [ ] Three SectionCard groups
- [ ] Each badge shows whether the value matches or overrides the admin default

---

## Phase UX-2 — Property Edit: Progressive Section Groups

**Target file:** `client/src/pages/PropertyEdit.tsx`

**Problem:** 811-line single scroll. All sections are flat; no at-a-glance summary per section. Users can't tell at a glance which sections are complete vs. need attention.

**Solution:** Apply `<SectionCard>` to every logical section that doesn't already use it. Add a compact 2-card summary strip at the top of the page showing overall completeness.

**Top-of-page summary strip (2 cards, not 4 — simpler page):**
```typescript
<div className="grid grid-cols-2 gap-3 mb-6">
  <StatCard variant="dashboard" label="Acquisition" value={property.acquisitionDate ? "Set" : "Not set"} format="text" />
  <StatCard variant="dashboard" label="Assumptions" value={`${completeCount}/${totalSections} sections`} format="text" />
</div>
```

**Section groups (each wraps existing content in SectionCard):**

| Section | Icon | Default state | Status badge |
|---|---|---|---|
| Basic Info | `Building2` | expanded | "Complete" / "Incomplete" |
| Timeline & Dates | `Calendar` | expanded | "N dates set" |
| Capital Structure | `DollarSign` | expanded | "$X acquisition price" |
| Revenue Assumptions | `TrendingUp` | expanded | "$X ADR · X% occ" |
| Operating Cost Rates | `Receipt` | collapsed | "N rates configured" |
| Fee Categories | `Layers` | collapsed | "N fees active" |
| Other Assumptions | `Settings` | collapsed | "Inflation X%" |

**Key rule:** Sections with required fields (Basic Info, Timeline, Capital Structure, Revenue) are expanded by default. Optional/advanced sections (Costs, Fees, Other) are collapsed by default.

**Acceptance criteria:**
- [ ] 7 SectionCard groups matching the table above
- [ ] Default expanded/collapsed state matches the table
- [ ] Summary strip shows completeness count
- [ ] Framer Motion for all expand/collapse
- [ ] No change to save behavior, validation, or form fields
- [ ] `npx tsc --noEmit` clean; `npm run test:summary` passes

---

## Phase UX-3 — Admin Section: Table + Sheet Pattern

**Target file:** `client/src/pages/Admin.tsx`

**Problem:** Admin sidebar groups (Steady State, Properties, Users, Scenarios, Brand & Appearance, Testing & Verification, App Settings) each contain dense nested tabs or scrolling forms. Hard to scan across groups.

**Solution:** Each admin group becomes a `<Table>` listing settings rows. Clicking a row opens a `<Sheet>` slide-in panel with the full edit controls for that setting. The main area stays clean and scannable.

**General pattern:**
```typescript
// Main area: settings table
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Setting</TableHead>
      <TableHead>Current value</TableHead>
      <TableHead>Source</TableHead>
      <TableHead className="w-12" />
    </TableRow>
  </TableHeader>
  <TableBody>
    {settings.map(setting => (
      <TableRow key={setting.key} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveSheet(setting.key)}>
        <TableCell className="font-medium">{setting.label}</TableCell>
        <TableCell className="text-muted-foreground">{setting.displayValue}</TableCell>
        <TableCell><Badge variant="outline">{setting.source}</Badge></TableCell>
        <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>

// Sheet panel: full edit controls
<Sheet open={activeSheet === "some-setting"} onOpenChange={() => setActiveSheet(null)}>
  <SheetContent side="right" className="w-[480px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>Edit: {activeSetting?.label}</SheetTitle>
      <SheetDescription>{activeSetting?.description}</SheetDescription>
    </SheetHeader>
    <div className="mt-6">
      {/* Full form for this setting */}
    </div>
  </SheetContent>
</Sheet>
```

**Admin groups to convert (prioritized):**
1. **Steady-State Defaults** — Model constants, market defaults. Table: constant name | current value | source | last updated
2. **Brand & Appearance** — Theme, logo, company name. Table: setting | preview | edit button
3. **App Settings** — Feature flags, integrations. Table: feature | status toggle | description

**Do NOT convert to table:**
- Users tab (already a good list UI)
- Testing & Verification (these are actions, not settings)

**Acceptance criteria:**
- [ ] Steady-State, Brand & Appearance, App Settings use table + sheet pattern
- [ ] Sheet panels slide in from the right, 480px wide
- [ ] Clicking outside or ESC closes the sheet
- [ ] Existing save handlers work inside the sheet — no behavior change
- [ ] Table rows have `data-testid="admin-row-{key}"`
- [ ] Sheets have `data-testid="admin-sheet-{key}"`

---

## Phase UX-4 — AI Intelligence: Specialist Roster Table

**Target file:** `client/src/pages/AiIntelligence.tsx`  
**Target file:** `client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`

**Problem:** 15+ sidebar items across 6 groups. The sidebar IS the navigation AND the content. First-time users can't understand the system at a glance.

**Solution:** Replace the sidebar-driven layout with a two-area layout:
1. **Top area:** Specialist roster table (all specialists in one scan)
2. **Right area / detail panel:** When a specialist is selected, show its full detail in a `<Sheet>` or in a right panel

**Roster table columns:**
```
Specialist | Role | Status | Last Run | Verdict | Actions
```

```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Specialist</TableHead>
      <TableHead>Area</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Last verdict</TableHead>
      <TableHead>Conviction</TableHead>
      <TableHead className="w-12" />
    </TableRow>
  </TableHeader>
  <TableBody>
    {specialists.map(sp => (
      <TableRow key={sp.id} className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelected(sp.id)}>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7">{sp.initials}</Avatar>
            <span className="font-medium">{sp.humanName}</span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{sp.subject}</TableCell>
        <TableCell>
          <Badge variant={sp.status === "built" ? "default" : sp.status === "partial" ? "secondary" : "outline"}>
            {sp.status}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{sp.lastRunAgo}</TableCell>
        <TableCell>
          <ConvictionBadge score={sp.qualityScore} />
        </TableCell>
        <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Group rows with `<Accordion>` sections** — one accordion item per sidebar group:
- "Management Company" (6 specialists)
- "Property" (2 specialists)
- "Constants & Authority" (4 specialists)
- "Infrastructure" (Rebecca, Resources, System)

**Sidebar:** Keep the sidebar but collapse it to icons-only by default when the roster table is the primary navigation. Sidebar nav items still work for direct navigation.

**Acceptance criteria:**
- [ ] Specialist roster table replaces the "click sidebar → see specialist page" pattern for the main landing view
- [ ] Grouped by accordion (Management Co, Property, Constants, Infrastructure)
- [ ] Click a row → Sheet panel opens with the specialist's full page content
- [ ] Sidebar remains functional for direct navigation
- [ ] `data-testid="specialist-row-{id}"` on each row
- [ ] `npm run test:summary` passes

---

## Sequencing & CC Review Gates

Replit implements one phase at a time. CC reviews each before the next starts.

```
UX-1a (Funding tab) → CC review → UX-1b → CC review → UX-1c → CC review
→ UX-1d → CC review → UX-1e → CC review → UX-2 → CC review
→ UX-3 → CC review → UX-4 → CC review → Done
```

CC review checklist per phase:
- [ ] Summary StatCards update in real-time (not stale)
- [ ] Expand/collapse uses Framer Motion (not CSS class toggle)
- [ ] Status badges reflect live data
- [ ] No existing tests broken
- [ ] No save behavior changed
- [ ] All 5 pre-commit gates pass

---

## Component Install Status

All components below are ALREADY installed — no `npx shadcn add` needed:

| Component | File path |
|---|---|
| SectionCard | `client/src/components/ui/section-card.tsx` |
| StatCard | `client/src/components/ui/stat-card.tsx` |
| ResearchBadge | `client/src/components/ui/research-badge.tsx` |
| Sheet | `client/src/components/ui/sheet.tsx` |
| Table | `client/src/components/ui/table.tsx` |
| Badge | `client/src/components/ui/badge.tsx` |
| Accordion | `client/src/components/ui/accordion.tsx` |
| HoverCard | `client/src/components/ui/hover-card.tsx` |
| framer-motion | `package.json` → `framer-motion ^12.35.0` |
| lucide-react | `package.json` → `lucide-react ^0.545.0` |
