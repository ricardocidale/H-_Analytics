---
name: help-documentation
description: Patterns for building and extending the H+ Analytics help system — InfoTooltips with industry benchmarks, user/checker manual section structure, glossary management, guided walkthrough steps, and GuidanceSideSheet anatomy. Use when adding tooltips, manual sections, glossary terms, tour steps, or guidance attribution.
---

# Help & Documentation System

## Purpose & Scope

The H+ Analytics help system provides contextual, in-place documentation across the application. It consists of five interconnected subsystems:

1. **InfoTooltips** — Inline benchmark citations on assumption fields
2. **User Manual** — Comprehensive reference organized by numbered sections
3. **Checker Manual** — Verification procedures for financial model reviewers
4. **Glossary** — Centralized term definitions with formulas and categories
5. **Guided Walkthrough** — Step-by-step interactive tour for new users
6. **GuidanceSideSheet** — AI research recommendation detail panel

---

## Architecture

### File Map

| Subsystem | Key Files |
|-----------|-----------|
| InfoTooltips | `client/src/components/ui/info-tooltip.tsx`, every `*Section.tsx` in `property-edit/` and `company-assumptions/` |
| User Manual | `client/src/pages/user-manual/UserManual.tsx`, `client/src/pages/user-manual/sections/Section*.tsx` |
| Checker Manual | `client/src/pages/checker-manual/CheckerManual.tsx`, `client/src/pages/checker-manual/sections/Section*.tsx` |
| Glossary | `client/src/lib/glossary.ts` |
| Walkthrough | `client/src/components/GuidedWalkthrough.tsx` |
| GuidanceSideSheet | `client/src/components/research/GuidanceSideSheet.tsx` |

### Shared UI Components

| Component | File | Usage |
|-----------|------|-------|
| `SectionCard` | `client/src/components/ui/section-card.tsx` | Collapsible section wrapper for manual pages |
| `ManualTable` | `client/src/components/ui/manual-table.tsx` | Striped data tables in manuals |
| `Callout` | `client/src/components/ui/callout.tsx` | Warning/info callout boxes in manuals |
| `InfoTooltip` | `client/src/components/ui/info-tooltip.tsx` | Hover tooltip with benchmark text |

---

## InfoTooltip Patterns

### Props

```tsx
interface InfoTooltipProps {
  text: string;           // Main tooltip content with benchmark citations
  formula?: string;       // Optional formula display (e.g., "Monthly = Revenue × Rate")
  formulaRef?: string;    // Formula reference code (e.g., "F-P-01")
  manualSection?: string; // Link anchor to user manual section
}
```

### Benchmark Citation Format

Every assumption tooltip should cite industry benchmarks with source attribution:

```
"[Field description]. [What it means for the model].
Industry benchmark ([Source Year]): [Tier1] [Range1], [Tier2] [Range2], ...
[Business model variant if applicable]."
```

**Example:**
```tsx
<InfoTooltip text="The maximum occupancy the property will reach once fully ramped.
STR benchmarks (STR/CoStar 2024): Luxury 65–75%, Upper Upscale 70–80%,
Upscale 72–82%, Upper Midscale 60–72%.
VRBO/STR properties: 55–75% depending on market seasonality and pricing strategy." />
```

### STR Chain Scale Ranges (Reference)

| Chain Scale | ADR Range | Stabilized Occ. | Source |
|-------------|-----------|-----------------|--------|
| Luxury | $396+ | 65–75% | STR/CoStar 2024 |
| Upper Upscale | $173–$312 | 70–80% | STR/CoStar 2024 |
| Upscale | $134–$198 | 72–82% | STR/CoStar 2024 |
| Upper Midscale | $100–$140 | 60–72% | STR/CoStar 2024 |
| VRBO/STR | Market-dependent | 55–75% | AirDNA/VRBO 2024 |

### Authoritative Sources for Tooltips

| Source | What It Covers |
|--------|----------------|
| STR/CoStar | Chain scales, ADR, occupancy, RevPAR |
| USALI 12th Edition | Expense categories, departmental structure |
| HVS Fee Survey | Management fee structures |
| CBRE Trends | Operating ratios, cap rates |
| AHLA Lodging Survey | Compensation benchmarks |
| AirDNA/VRBO | STR-specific metrics |

### Where Tooltips Live

Tooltips are embedded directly in the label prop of `ResearchContextFieldLabel` or as standalone `<InfoTooltip>` next to section headers:

```tsx
<ResearchContextFieldLabel
  label={<>Starting ADR <InfoTooltip text="..." /></>}
  badgeProps={{ entry: researchValues.adr }}
  onApplyValue={() => ...}
  guidanceContext={gc("adr", "Starting ADR")}
/>
```

---

## Manual Section Structure

### User Manual Sections

Each section is a separate file in `client/src/pages/user-manual/sections/`:

```tsx
interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section01Overview({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="overview"
      title="1. Overview & Getting Started"
      icon={IconDashboard}
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      {/* Section content */}
    </SectionCard>
  );
}
```

### Naming Convention

- File: `Section{NN}{Topic}.tsx` (e.g., `Section18Research.tsx`)
- ID: lowercase kebab-case (e.g., `ai-research`)
- Title: `"{NN}. {Human-Readable Title}"` (e.g., `"18. Research Intelligence"`)

### Content Patterns

| Element | Component | Usage |
|---------|-----------|-------|
| Data tables | `<ManualTable headers={[...]} rows={[...]} />` | Structured reference data |
| Warnings | `<Callout>text</Callout>` | Important caveats |
| Subsections | `<h3>` or `<h4>` with `font-semibold text-foreground` | Topic divisions |
| Color indicators | `<span className="w-2.5 h-2.5 rounded-full bg-{color}-500" />` | Status dot legends |
| Inline emphasis | `<span className="font-medium text-foreground">term</span>` | Key terms in descriptions |

### Adding a New Manual Section

1. Create `client/src/pages/user-manual/sections/Section{NN}{Topic}.tsx`
2. Follow the `SectionProps` interface pattern
3. Register in `UserManual.tsx` sections array with matching id
4. Add to table of contents

---

## Glossary Management

### Schema

```typescript
// client/src/lib/glossary.ts
interface GlossaryEntry {
  term: string;        // Full display name
  definition: string;  // Plain-text definition
  formula?: string;    // LaTeX-style formula string
  formulaRef?: string; // Reference code (e.g., "F-P-01")
  category: string;    // Grouping category
}

const GLOSSARY: Record<string, GlossaryEntry> = { ... };
```

### Categories

| Category | Examples |
|----------|----------|
| Revenue | ADR, RevPAR, Occupancy Ramp |
| Valuation | Cap Rate, WACC, IRR |
| Accounting Standard | GAAP, USALI |
| Classification | STR chain scales (Luxury, Upper Upscale, etc.) |
| Business Model | Hotel, VRBO/STR, Lodge |
| Research | Freshness, Staleness, Context Pack, Guidance |
| Fees | Base Fee, Incentive Fee |
| Data Source | STR, Chain Scale |

### Adding a Glossary Term

```typescript
"Term Key": {
  term: "Full Display Name (Context)",
  definition: "Clear definition. Include benchmark ranges and source attribution where applicable.",
  category: "Category",
},
```

---

## Guided Walkthrough

### Tour Step Format

```typescript
// client/src/components/GuidedWalkthrough.tsx
function getTourSteps(): TourStep[] {
  return [
    {
      target: '[data-testid="some-element"]',  // CSS selector
      title: "Step Title",
      description: "Plain-language description of what this element does and why it matters."
    },
  ];
}
```

### Selector Strategies

| Strategy | Example | When to Use |
|----------|---------|-------------|
| `data-testid` | `[data-testid="badge-research"]` | Interactive elements, dynamic content |
| `href` | `[href="/company"]` | Navigation links |
| Custom attribute | `[data-status]` | Status-aware elements |

### Adding a Walkthrough Step

1. Add the step object to `getTourSteps()` array in `GuidedWalkthrough.tsx`
2. Ensure the target element exists in the DOM during the tour
3. Place new steps in logical order (after related navigation steps, before closing steps)
4. Keep descriptions under 2 sentences — the tour should be quick

---

## GuidanceSideSheet Anatomy

### Tabs

| Tab | Component | Content |
|-----|-----------|---------|
| Range | `RecommendationTab` | P25/P50/P75 range visualization, confidence indicator, source attribution, methodology |
| Peers | `PeerComparisonsTab` | Comparable property values with bar chart |
| Trail | `RelaxationTrailStepper` | Search relaxation provenance steps |
| Impact | `ImpactAnalysisTab` | Downstream metric effects of applying recommendation |

### Attribution Card (RecommendationTab)

The attribution card displays:
- **Confidence indicator** — colored dot + label (High/Medium/Low)
- **Relaxation level badge** — amber pill showing relaxation depth (if > 0)
- **Source name** — Shield icon + source name in bold
- **Source date** — Clock icon + date string
- **Fallback** — "Source attribution unavailable" (italic) when no source
- **Methodology** — FileText icon + reasoning text block

### GuidanceRecord Fields

| Field | Type | Display Location |
|-------|------|-----------------|
| `valueLow/valueMid/valueHigh` | number | Range visualization |
| `confidence` | string | Attribution card (dot color) |
| `sourceName` | string | Attribution card |
| `sourceDate` | string | Attribution card |
| `reasoning` | string | Methodology block |
| `relaxationLevel` | number | Relaxation badge |
| `comparableSet` | json | Peers tab |

---

## Design Patterns

### Consistency Rules

1. All benchmark citations must include the source name and year (e.g., "STR/CoStar 2024")
2. Business model variants (Hotel vs VRBO/STR vs Lodge) should be called out when ranges differ
3. Freshness colors must match the IntelligenceStatusBar: green=current, amber=stale, red=missing, blue=running
4. Manual content should avoid implementation details that may change — focus on user-facing behavior

### Testing

- Every interactive element must have a `data-testid` attribute
- Tooltip text should be verifiable via e2e tests
- Manual sections should render without errors when expanded/collapsed

---

## Portability Notes

This help system pattern is reusable across Norfolk AI products:
- InfoTooltip component is generic — swap benchmark data for any domain
- Manual section structure works for any product documentation
- Glossary is a simple key-value store — domain-agnostic
- Walkthrough uses CSS selectors — works with any UI framework
- GuidanceSideSheet pattern applies to any AI recommendation system with confidence/source/reasoning
