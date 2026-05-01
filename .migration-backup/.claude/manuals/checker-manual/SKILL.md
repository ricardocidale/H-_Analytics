# H+ Analytics by Norfolk AI — Verification Manual

## About This Manual

This manual serves as the authoritative reference guide for verification officers and financial auditors tasked with validating the H+ Analytics by Norfolk AI Business Simulation Portal. It provides comprehensive guidance on the platform's financial modeling architecture, calculation methodologies, and the structured verification procedures required to certify the accuracy of all financial outputs.

The portal is a full-stack financial modeling platform built for a boutique hotel management company. It performs real-time financial simulation, multi-year projection, and scenario analysis across a portfolio of luxury boutique hotels in North America and Latin America. Every financial calculation in the system is deterministic — identical inputs always produce identical outputs — making systematic verification both feasible and essential.

## File Structure

The in-app Checker Manual is split into lazy-loaded per-section files for performance and maintainability.

| File | Purpose |
|------|---------|
| `client/src/pages/checker-manual/index.tsx` | Page wrapper, layout, TOC, export buttons |
| `client/src/pages/checker-manual/ManualContent.tsx` | Thin orchestrator — lazy-loads all 21 sections |
| `client/src/pages/checker-manual/constants.ts` | Section metadata (IDs, titles, icons) |
| `client/src/pages/checker-manual/types.ts` | TypeScript interfaces |
| `client/src/pages/checker-manual/TableOfContents.tsx` | Navigation sidebar |
| `client/src/pages/checker-manual/useManualExports.ts` | PDF and Full Data Export logic |

### Section Files (`client/src/pages/checker-manual/sections/`)

| # | File | Section ID | Title |
|---|------|-----------|-------|
| 1 | `Section01AppOverview.tsx` | `app-overview` | Application Overview |
| 2 | `Section02MgmtCompany.tsx` | `mgmt-company` | Management Company |
| 3 | `Section03PropertyPortfolio.tsx` | `property-portfolio` | Property Portfolio (SPVs) |
| 4 | `Section04GlobalAssumptions.tsx` | `global-assumptions` | Global Assumptions |
| 5 | `Section05PropertyAssumptions.tsx` | `property-assumptions` | Property-Level Assumptions |
| 6 | `Section06CashflowStreams.tsx` | `cashflow-streams` | Cash Flow Streams |
| 7 | `Section07FinancialStatements.tsx` | `financial-statements` | Financial Statements |
| 8 | `Section08ExportSystem.tsx` | `export-system` | Export System |
| 9 | `Section09DesignConfig.tsx` | `design-config` | Design Configuration |
| 10 | `Section10ScenarioMgmt.tsx` | `scenario-mgmt` | Scenario Management |
| 11 | `Section11MyProfile.tsx` | `my-profile` | My Profile |
| 12 | `Section12DashboardKPIs.tsx` | `dashboard-kpis` | Dashboard & KPIs |
| 13 | `Section13AIResearch.tsx` | `ai-research` | AI Research & Calibration |
| 14 | `Section14PropertyCRUD.tsx` | `property-crud` | Property CRUD & Images |
| 15 | `Section15TestingMethodology.tsx` | `testing-methodology` | Testing Methodology |
| 16 | `Section16PropertyFormulas.tsx` | `property-formulas` | Property Financial Formulas |
| 17 | `Section17CompanyFormulas.tsx` | `company-formulas` | Management Company Formulas |
| 18 | `Section18ConsolidatedFormulas.tsx` | `consolidated-formulas` | Consolidated Portfolio Formulas |
| 19 | `Section19InvestmentReturns.tsx` | `investment-returns` | Investment Returns (DCF/FCF/IRR) |
| 20 | `Section20FundingFinancing.tsx` | `funding-financing` | Funding, Financing & Refinancing |
| 21 | `Section21Glossary.tsx` | `glossary` | Glossary |

## How to Edit

To edit a specific section, open the corresponding file in `sections/`. Each file is a self-contained React component that exports a default function with `SectionProps` interface (`expanded`, `onToggle`, `sectionRef`). The component wraps its content in a `SectionCard` and uses `ManualTable` and `Callout` for structured content.

To add a new section:
1. Create `SectionNN<Name>.tsx` in `sections/`
2. Add entry to `constants.ts`
3. Add lazy import to `ManualContent.tsx`

## The 7-Phase Verification Workflow

1. **Phase 1 — Input Verification.** Confirm defaults and USALI benchmark ranges.
2. **Phase 2 — Calculation Verification.** Hand-calculate and cross-validate formulas.
3. **Phase 3 — Financial Statement Reconciliation.** BS identity, CF reconciliation per ASC 230, IS flow.
4. **Phase 4 — IRR / DCF / FCF Verification.** NPV ≈ 0 at IRR, FCF derivations, terminal value.
5. **Phase 5 — Scenario & Stress Testing.** Edge cases, boundary conditions, scenario comparison.
6. **Phase 6 — Reports & Exports Completeness.** All formats generate, values match screen.
7. **Phase 7 — Documentation & Sign-Off.** Audit opinion, checklist, sign-off.

## Additional Resources

- **Formulas reference:** Sections 16–20 in `sections/`
- **Glossary:** Section 21 in `sections/Section21Glossary.tsx`
- **LLM context files:** `.claude/manuals/checker-manual/skills/` and `formulas/`
