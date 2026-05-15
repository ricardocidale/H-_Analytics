# PDF Export Agent Skill — Valentina

## Overview

Valentina is the **Financial Report PDF Export Orchestrator** for H+ Analytics.
She is a cross-app Specialist (single name, no NN suffix) that owns the
end-to-end quality contract for all financial report PDF exports.

**Valentina supervises Otavio.** Otavio is a deterministic Minion — he does
the mechanical row-splitting. Valentina provides the strategic rules and
connects the export capability to Rebecca.

---

## The Four-Rule Pagination Contract

These rules are enforced together on every PDF export. They are implemented
across three files (`pdf-styles.ts`, `pdf-html-templates.ts`, and
`otavio-pagination.ts`) under Valentina's ownership.

### Rule (a) — Fresh page per statement
Every financial statement (Income Statement, Balance Sheet, Cash Flow, etc.)
starts on a fresh page.

**Implementation:** `buildPdfHtml` in `pdf-html-templates.ts` calls
`extractBaseTitle()` to detect statement boundaries. When the base title
changes (ignoring "cont'd N/M" suffixes), the first `<div class="content-page">`
of that section is rewritten to `<div class="content-page statement-first">`.
CSS: `.statement-first { page-break-before: always; }`.

### Rule (b) — Charts fill their own page
Every chart (`line_chart` section) occupies a full page with generous padding.
Charts must not look cramped or float in a small region.

**Implementation:** `buildPdfHtml` injects both `statement-first` and
`chart-solo` classes on every line_chart section. CSS `.chart-solo
.line-chart-container` sets height to 160mm (landscape) / 192mm (portrait)
plus 8–24mm of padding. Baseline `.line-chart-container` height was also
increased from 110/130mm to 160/192mm.

### Rule (c) — Assumption groups each on a fresh page
Assumption sections are split into **named semantic groups** (one page per
group). Groups correspond to the section headers within the assumption block
(e.g., "Partner Compensation", "Staffing", "Fixed Overhead (Year 1)").

**Implementation:** Otavio's new `splitAssumptionSectionByGroups()` function
walks the rows of any assumption `TableSection`, splits at every `type:
"header"` row, and produces one sub-`TableSection` per group. Each sub-section
is titled `"Assumptions — <Entity> — <GroupLabel>"`. The sections then flow
through `buildPdfHtml` where they each get `statement-first` (new title =
new page). Any group that is still too long for a single page is further split
by row count by `splitTableSection`.

**Company assumption groups (from `buildCompanyAssumptionsSection`):**
- Company Identity
- Macro & Inflation
- Management Fees
- Funding
- Partner Compensation
- Staffing
- Fixed Overhead (Year 1)
- Variable Costs
- Tax & Returns
- Acquisition (Standard Package)
- Debt (Default)
- Exit Defaults

**Property assumption groups (from `buildPropertyAssumptionsSection`):**
- Property Profile
- Revenue Assumptions
- Operating Cost Rates
- Management Fees
- Operating Assumptions
- Acquisition Debt
- Refinance Debt
- Exit Assumptions
- Brand Fee Stack
- Hotel Management Agreement
- Condo / Mixed-Use

### Rule (d) — No dark backgrounds on headers or footers
Page headers use a border-only treatment — no dark navy fill. Title text is
dark on a white background.

**Implementation in `pdf-styles.ts`:**
- `.page-hdr-bar`: `background: transparent; border-top: 3px solid ${DK}; border-bottom: 2px solid ${SAGE};`
- `.page-hdr-title`: `color: ${NAVY}` (was `${WHITE}`)
- `.page-hdr-sub`: `color: ${GR}` (was white semi-transparent)
- `.page-hdr-brand`: `color: ${DK}; font-weight: 700` (was SAGE)
- Cover page dark background is intentionally preserved — rule (d) applies
  only to **content page** headers and footers, not the cover.

---

## Key Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/report/agents/valentina.ts` | Agent definition (role, descriptions, pipeline) |
| `artifacts/api-server/src/report/minions/otavio-pagination.ts` | Otavio minion — deterministic pagination + group splitting |
| `artifacts/api-server/src/pdf-styles.ts` | CSS: header bar, chart sizing, `.statement-first`, `.chart-solo` |
| `artifacts/api-server/src/routes/pdf-html-templates.ts` | `buildPdfHtml` — injects page-break classes |
| `artifacts/api-server/src/report/assumption-sections.ts` | Assumption section builders (groups defined here as `header()` rows) |
| `artifacts/api-server/src/chat/rebecca-tool-defs-report.ts` | Rebecca tool definition: `generate_financial_report_export_link` |
| `artifacts/api-server/src/chat/rebecca-tool-impls-report.ts` | Rebecca tool implementation |
| `artifacts/api-server/src/chat/rebecca-tool-definitions.ts` | Tool registration (calls `getReportExportTools()`) |
| `artifacts/api-server/src/chat/rebecca-tool-dispatch.ts` | Dispatch: `case "generate_financial_report_export_link"` |

---

## Rebecca Integration

When a user tells Rebecca to export their report:

> "Export my financial report as a PDF"
> "Download the income statement"
> "Get me a PDF of the property report in landscape"

Rebecca calls `generate_financial_report_export_link` with the user's
intent-derived parameters:

```typescript
{
  propertyId?: number,    // omit for company-level
  format: "pdf" | "excel" | "csv" | "zip",
  orientation: "landscape" | "portrait",
  statements?: string[],  // omit to export all
}
```

Valentina returns a structured response with the export endpoint URL,
format label, and the pagination rules that will be applied. Rebecca
relays this to the user with a clear "click here to download" message.

---

## Agent Taxonomy

```text
Valentina (Specialist / Agent)
  └─ Otavio (Minion — deterministic, no LLM)
       └─ splitAssumptionSectionByGroups() — group splitting
       └─ splitTableSection() — row-count splitting
```

Valentina does NOT call an LLM for layout decisions. All layout is
deterministic. Her LLM role is strictly in the Rebecca conversation surface
(interpreting user intent, formatting the response).

---

## Adding a New Assumption Group

If a new header is added to `buildCompanyAssumptionsSection` or
`buildPropertyAssumptionsSection`, Otavio will automatically detect it
as a group boundary (any row with `type: "header"`) and give it its own
page. No changes to Otavio or Valentina are required.

---

## Extending the Pagination Rules

To change the page-break logic:
1. Update CSS classes in `pdf-styles.ts`
2. Update `buildPdfHtml` in `pdf-html-templates.ts` to inject the new class
3. Update Otavio's `splitAssumptionSectionByGroups` or `splitTableSection` if
   the change affects row capacity
4. Update this skill (rules section) and `valentina.ts` (long_description)

---

## Reserved Agent Name

**Valentina** is a registered cross-app Specialist. This name must not be
reused for any other agent, minion, or orchestrator. See
`.agents/skills/slide-factory/SKILL.md` for the full reserved-names inventory.
